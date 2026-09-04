import "server-only";
import { requireWriterOn } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { startAction } from "@/lib/observability";
import {
  IVA_DOCUMENT_JOB_TYPE,
  IVA_OUTCOMES,
  ivaFetchReadiness,
  planBulkFetch,
  providerForAccess,
  selectAccessCredential,
  type IvaDocumentJobPayload,
  type IvaNotReadyReason,
} from "@toc/core/domain";
import { getAtAccessMode } from "./access";
import { deriveState, notReadyCopy, type IvaDocumentRow } from "./present";
import {
  buildBulkRows,
  credentialForReadiness,
  tallyBulk,
  toCredentialCandidates,
  type BulkCompany,
  type CredentialRow,
  type EnqueueOutcome,
  type LastFetch,
} from "./bulk";

export { IVA_DOCUMENT_JOB_TYPE };

/**
 * As colunas da view `iva_documents_overview`, 1:1 com `IvaDocumentRow`.
 *
 * Escritas por extenso e não com `*`: a view pode ganhar uma coluna (e um dia
 * ganhará), e um `select("*")` levá-la-ia ao browser sem ninguém decidir que
 * devia ir. É a mesma disciplina de `SAFE_COLUMNS` nas credenciais.
 */
export const OVERVIEW_COLUMNS =
  "company_id, team_id, company_name, nif, company_status, toconline_company_id, toconline_cluster, period_id, period, period_status, due_date, document_id, entity, reference, amount, valid_until, document_status, has_file, extracted_at, job_id, job_status, job_outcome, job_period, job_batch_id, job_error, job_trace_id, job_attempts, job_created_at, job_finished_at";

/** Os providers que podem abrir a sessão do IVA, seja qual for a rota. */
const ACCESS_PROVIDERS = ["at", "toconline"];

/** Empresas por bloco no «buscar todas». */
const BATCH_CONCURRENCY = 8;

/**
 * A listagem do Módulo 1, uma linha por empresa.
 *
 * Cliente de servidor (RLS) **com `team_id` explícito**: para um operador a RLS
 * já reduz a uma equipa, mas o admin é global e veria as empresas de todos os
 * gabinetes numa listagem que diz ser de um só. É a mesma armadilha de
 * `getTeamCredential` (integrations/service.ts:90-98).
 */
export async function listIvaDocuments(teamId: string): Promise<IvaDocumentRow[]> {
  if (!teamId) return [];
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("iva_documents_overview")
    .select(OVERVIEW_COLUMNS)
    .eq("team_id", teamId)
    .order("company_name");
  return (data ?? []) as IvaDocumentRow[];
}

const ENQUEUE_STATUSES = [400, 401, 403, 404, 500] as const;
/** Os únicos códigos que este serviço devolve — nunca um 5xx do Postgres em bruto. */
export type IvaEnqueueStatus = (typeof ENQUEUE_STATUSES)[number];

export type IvaEnqueueResult =
  | { ok: true; jobId: string; alreadyRunning: boolean }
  | { ok: false; status: IvaEnqueueStatus; error: string };

/** `requireWriterOn` devolve `number`; aqui o tipo volta a ser fechado, sem `as`. */
function enqueueStatus(status: number): IvaEnqueueStatus {
  return ENQUEUE_STATUSES.find((s) => s === status) ?? 500;
}

export interface IvaBatchResult {
  ok: true;
  batchId: string;
  enqueued: number;
  skipped: { alreadyRunning: number; notReady: number; alreadyFetched: number };
  notReadyReasons: Partial<Record<IvaNotReadyReason, number>>;
}

type Admin = ReturnType<typeof getSupabaseAdminClient>;

interface CompanyRow extends BulkCompany {
  team_id: string;
}

/** As credenciais que servem esta empresa: as da equipa e as dela. */
async function accessCredentials(
  admin: Admin,
  teamId: string,
  companyId: string | null,
): Promise<CredentialRow[]> {
  let query = admin
    .from("integration_credentials")
    .select("id, provider, company_id, status, secret_encrypted, metadata")
    .eq("team_id", teamId)
    .in("provider", ACCESS_PROVIDERS);
  if (companyId !== null) {
    query = query.or(`company_id.is.null,company_id.eq.${companyId}`);
  }
  const { data } = await query;
  return (data ?? []) as CredentialRow[];
}

/** O job de IVA por consumir desta empresa, se houver. */
async function inFlightJobId(admin: Admin, companyId: string): Promise<string | null> {
  const { data } = await admin
    .from("jobs")
    .select("id")
    .eq("company_id", companyId)
    .eq("type", IVA_DOCUMENT_JOB_TYPE)
    .in("status", ["pending", "running"])
    .limit(1)
    .maybeSingle();
  return data === null ? null : (data as { id: string }).id;
}

/**
 * Enfileira a busca da guia de uma empresa.
 *
 * A ordem das verificações é a ordem por que se resolvem os problemas, e
 * termina no que só a base de dados sabe: o índice parcial
 * `jobs_company_inflight_uq` é a autoridade sobre "já há um job para esta
 * empresa". A leitura do passo 4 é o caminho normal (dá uma mensagem honesta ao
 * primeiro clique repetido); o `23505` é a rede para a corrida que a leitura não
 * apanha — dois separadores abertos, dois operadores, o lote e o botão ao mesmo
 * tempo.
 */
export async function enqueueIvaFetch(
  companyId: string,
  requestedTeamId = "",
  opts: { batchId?: string; force?: boolean } = {},
): Promise<IvaEnqueueResult> {
  const auth = await requireWriterOn(requestedTeamId);
  if (!auth.ok) return { ok: false, status: enqueueStatus(auth.status), error: auth.error };
  const { actor, teamId } = auth;

  const admin = getSupabaseAdminClient();

  const { data: companyData } = await admin
    .from("companies")
    .select("id, team_id, status, nif, toconline_company_id, toconline_cluster")
    .eq("id", companyId)
    .maybeSingle();
  const company = (companyData ?? null) as CompanyRow | null;
  // Empresa de outra equipa responde 404, não 403: quem não a pode ver também
  // não tem de saber que ela existe.
  if (company === null || company.team_id !== teamId) {
    return { ok: false, status: 404, error: "Empresa não encontrada." };
  }

  const access = getAtAccessMode();
  const provider = providerForAccess(access);
  const candidates = toCredentialCandidates(await accessCredentials(admin, teamId, companyId));

  // Um duplo-clique não pode lançar duas sessões de browser contra o portal.
  // Devolve-se o job em curso — e **sem abrir trace**, que ficaria órfão.
  const running = await inFlightJobId(admin, companyId);
  if (running !== null) return { ok: true, jobId: running, alreadyRunning: true };

  const readiness = ivaFetchReadiness({
    access,
    company: {
      status: company.status,
      tocCompanyId: company.toconline_company_id,
      tocCluster: company.toconline_cluster,
      nif: company.nif,
    },
    credential: credentialForReadiness(access, companyId, candidates),
    inFlight: false,
  });
  if (!readiness.ready) {
    return { ok: false, status: 400, error: notReadyCopy(readiness.reason, access) };
  }

  // Defesa em profundidade: a prontidão acima já recusou tudo o que isto recusa
  // (as duas leem os mesmos candidatos). Fica porque é daqui que sai o
  // `credentialId` do payload, e um `credentialId` errado só se descobriria no
  // worker, meia hora depois.
  const sel = selectAccessCredential(access, companyId, candidates);
  if (!sel.ok) return { ok: false, status: 400, error: IVA_OUTCOMES[sel.outcome].label };

  const payload: IvaDocumentJobPayload = {
    teamId,
    companyId,
    access,
    credentialId: sel.credentialId,
    credentialScope: sel.scope,
  };
  if (opts.force === true) payload.force = true;
  if (opts.batchId !== undefined) payload.batchId = opts.batchId;

  let act: Awaited<ReturnType<typeof startAction>> | undefined;
  try {
    // Só ids, rota e tipo de job — nunca o NIF, o nome da empresa ou o segredo.
    act = await startAction({
      triggerSource: "documentos.iva.fetch",
      type: "job.enqueued",
      createdBy: actor.id,
      correlationKey: `company:${companyId}:iva`,
      payload: {
        teamId,
        companyId,
        provider,
        jobType: IVA_DOCUMENT_JOB_TYPE,
        ...(opts.batchId === undefined ? {} : { batchId: opts.batchId }),
      },
    });

    const { data, error } = await admin
      .from("jobs")
      .insert({
        team_id: teamId,
        company_id: companyId,
        type: IVA_DOCUMENT_JOB_TYPE,
        trace_id: act.traceId,
        triggering_event_id: act.eventId,
        payload,
      })
      .select("id")
      .single();

    if (error !== null) {
      // `23505` = o índice parcial recusou o duplicado. Não é falha de ninguém:
      // o trace fecha-se como saltado (não como erro, que mandaria alguém
      // investigar) e devolve-se o job que já lá estava.
      if (error.code === "23505") {
        await act.skipped("already_running");
        const raced = await inFlightJobId(admin, companyId);
        if (raced !== null) return { ok: true, jobId: raced, alreadyRunning: true };
        // O job terminou entre o conflito e a releitura. Raríssimo, e sem nada
        // de útil para devolver — quem chamou volta a tentar.
        return { ok: false, status: 500, error: "Erro interno." };
      }
      throw new Error(error.message);
    }

    // handOff e não success: o trace fica ABERTO até o worker terminar. Um job
    // enfileirado e nunca consumido tem de aparecer como trace por fechar.
    await act.handOff();
    return { ok: true, jobId: (data as { id: string }).id, alreadyRunning: false };
  } catch (e) {
    const message = e instanceof Error ? e.message : "erro desconhecido";
    await act?.failure(message);
    // Nunca a mensagem crua: ela vem do Postgres e pode trazer nomes de colunas,
    // constraints e valores da linha.
    return { ok: false, status: 500, error: "Erro interno." };
  }
}

/**
 * Enfileira a busca de todas as empresas da equipa.
 *
 * O lote tem trace próprio, fechado **aqui** com `success()`: o trabalho do lote
 * é decidir e enfileirar, e acaba quando o último job entra na fila. Um trace
 * partilhado por todos os jobs seria fechado pelo primeiro worker a terminar, e
 * os restantes 181 pendurariam eventos num trace já fechado — cada job tem o
 * SEU trace, aberto por `enqueueIvaFetch`, e o `batchId` no payload é o que os
 * volta a juntar.
 */
export async function enqueueIvaFetchAll(
  requestedTeamId = "",
  opts: { onlyMissing: boolean } = { onlyMissing: true },
): Promise<IvaBatchResult | { ok: false; status: number; error: string }> {
  const auth = await requireWriterOn(requestedTeamId);
  if (!auth.ok) return auth;
  const { actor, teamId } = auth;

  const admin = getSupabaseAdminClient();
  const access = getAtAccessMode();
  const provider = providerForAccess(access);

  const [{ data: companiesData }, credentialRows, { data: inFlightData }] = await Promise.all([
    admin
      .from("companies")
      .select("id, status, nif, toconline_company_id, toconline_cluster")
      .eq("team_id", teamId)
      .order("name"),
    // Sem `companyId`: o lote precisa também dos marcadores por empresa, que são
    // o que impede uma senha já recusada de ser tentada 182 vezes.
    accessCredentials(admin, teamId, null),
    admin
      .from("jobs")
      .select("company_id")
      .eq("team_id", teamId)
      .eq("type", IVA_DOCUMENT_JOB_TYPE)
      .in("status", ["pending", "running"]),
  ]);

  const companies = (companiesData ?? []) as BulkCompany[];
  const inFlight = new Set(
    ((inFlightData ?? []) as { company_id: string | null }[])
      .map((j) => j.company_id)
      .filter((id): id is string => id !== null),
  );

  // O último desfecho só interessa a `onlyMissing` — sem ele não vale uma
  // leitura da listagem inteira.
  const lastByCompany = new Map<string, LastFetch>();
  if (opts.onlyMissing) {
    for (const row of await listIvaDocuments(teamId)) {
      lastByCompany.set(row.company_id, {
        outcome: deriveState(row).outcome,
        finishedAt: row.job_finished_at,
      });
    }
  }

  const rows = buildBulkRows({
    access,
    companies,
    candidates: toCredentialCandidates(credentialRows),
    inFlight,
    lastByCompany,
  });
  const plan = planBulkFetch(rows, { onlyMissing: opts.onlyMissing, now: new Date() });
  const batchId = crypto.randomUUID();

  let batch: Awaited<ReturnType<typeof startAction>> | undefined;
  try {
    batch = await startAction({
      triggerSource: "documentos.iva.fetch_all",
      type: "job.batch_enqueued",
      createdBy: actor.id,
      correlationKey: `team:${teamId}:iva`,
      payload: {
        teamId,
        batchId,
        provider,
        planned: plan.toEnqueue.length,
        skippedInFlight: plan.skipped.alreadyRunning.length,
        skippedNotReady: Object.values(plan.skipped.notReady).reduce((n, ids) => n + ids.length, 0),
        skippedFetched: plan.skipped.alreadyFetched.length,
      },
    });

    // Em blocos e não todos de uma vez: 182 empresas dariam 182 inserções e 182
    // traces em simultâneo contra o mesmo pool de ligações.
    const outcomes: EnqueueOutcome[] = [];
    for (let i = 0; i < plan.toEnqueue.length; i += BATCH_CONCURRENCY) {
      const chunk = plan.toEnqueue.slice(i, i + BATCH_CONCURRENCY);
      const results = await Promise.all(
        chunk.map((id) => enqueueIvaFetch(id, teamId, { batchId })),
      );
      for (const result of results) {
        if (!result.ok) outcomes.push("failed");
        else outcomes.push(result.alreadyRunning ? "already_running" : "enqueued");
      }
    }

    await batch.success();
    const counts = tallyBulk(plan, outcomes);
    return { ok: true, batchId, ...counts };
  } catch (e) {
    const message = e instanceof Error ? e.message : "erro desconhecido";
    await batch?.failure(message);
    return { ok: false, status: 500, error: "Erro interno." };
  }
}
