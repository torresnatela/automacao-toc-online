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
  type CredentialCandidate,
  type IvaDocumentJobPayload,
  type IvaNotReadyReason,
} from "@toc/core/domain";
import { getAtAccessMode } from "./access";
import { notReadyCopy, type IvaDocumentRow } from "./present";
import {
  bulkRowsFromReads,
  companyForEnqueue,
  credentialForReadiness,
  enqueueStatus,
  resolveJobInsert,
  tallyBulk,
  toCredentialCandidates,
  toSafeCredentialCandidates,
  type BulkCompany,
  type CredentialRow,
  type EnqueueOutcome,
  type IvaEnqueueResult,
  type ReadResult,
  type SafeCredentialRow,
  type TraceClosure,
} from "./bulk";

export type { IvaEnqueueResult, IvaEnqueueStatus } from "./bulk";

/**
 * As colunas da view `iva_documents_overview`, 1:1 com `IvaDocumentRow`.
 *
 * Escritas por extenso e não com `*`: a view pode ganhar uma coluna (e um dia
 * ganhará), e um `select("*")` levá-la-ia ao browser sem ninguém decidir que
 * devia ir. É a mesma disciplina de `SAFE_COLUMNS` nas credenciais.
 */
export const OVERVIEW_COLUMNS =
  "company_id, team_id, company_name, nif, company_status, toconline_company_id, toconline_cluster, period_id, period, period_status, due_date, document_id, entity, reference, amount, valid_until, document_status, has_file, extracted_at, job_id, job_status, job_outcome, job_period, job_batch_id, job_error, job_trace_id, job_attempts, job_created_at, job_finished_at, job_deferred";

/** Os providers que podem abrir a sessão do IVA, seja qual for a rota. */
const ACCESS_PROVIDERS = ["at", "toconline"];

/** Empresas por bloco no «buscar todas». */
const BATCH_CONCURRENCY = 8;

/**
 * A listagem do Módulo 1, uma linha por empresa, com o erro **por tratar**.
 *
 * Cliente de servidor (RLS) **com `team_id` explícito**: para um operador a RLS
 * já reduz a uma equipa, mas o admin é global e veria as empresas de todos os
 * gabinetes numa listagem que diz ser de um só. É a mesma armadilha de
 * `getTeamCredential` (integrations/service.ts:90-98).
 *
 * Os dois chamadores querem coisas diferentes de uma leitura falhada, e é por
 * isso que há duas funções: a página mostra uma tabela vazia (visível, e o
 * operador recarrega), o lote **tem** de falhar alto — sem os desfechos do mês,
 * `onlyMissing` concluiria que nada foi buscado e mandaria 182 sessões de
 * browser ao portal.
 */
async function readIvaDocuments(teamId: string): Promise<ReadResult<IvaDocumentRow>> {
  if (!teamId) return { data: [], error: null };
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("iva_documents_overview")
    .select(OVERVIEW_COLUMNS)
    .eq("team_id", teamId)
    .order("company_name");
  return { data: (data ?? null) as IvaDocumentRow[] | null, error };
}

export async function listIvaDocuments(teamId: string): Promise<IvaDocumentRow[]> {
  const { data } = await readIvaDocuments(teamId);
  return data ?? [];
}

/**
 * As credenciais que servem esta equipa, como a prontidão as quer ver.
 *
 * A **página** também precisa disto, e não só o serviço: sem os candidatos por
 * empresa ela resolveria a prontidão pela credencial de equipa apenas, e
 * divergiria de `enqueueIvaFetch` — o botão diria "pronta" numa empresa cujo
 * marcador de senha recusada a bloqueia (`credentialForReadiness`), e o clique
 * seria recusado logo a seguir.
 *
 * Lê a view segura com o cliente **RLS** (o ciphertext não existe nela por
 * construção) e devolve o erro por tratar: uma leitura falhada daria
 * `candidates = []`, e daí "Configure o acesso à AT" em 182 linhas que estão
 * perfeitamente configuradas — mandar corrigir o que não está partido é pior do
 * que dizer que não se conseguiu ler.
 */
export async function listAccessCredentials(
  teamId: string,
): Promise<{ candidates: CredentialCandidate[]; failed: boolean }> {
  if (!teamId) return { candidates: [], failed: false };
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("integration_credentials_safe")
    .select("id, provider, company_id, status, has_secret, metadata")
    .eq("team_id", teamId)
    .in("provider", ACCESS_PROVIDERS);

  if (error) return { candidates: [], failed: true };
  return {
    candidates: toSafeCredentialCandidates((data ?? []) as SafeCredentialRow[]),
    failed: false,
  };
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
): Promise<ReadResult<CredentialRow>> {
  let query = admin
    .from("integration_credentials")
    .select("id, provider, company_id, status, secret_encrypted, metadata")
    .eq("team_id", teamId)
    .in("provider", ACCESS_PROVIDERS);
  if (companyId !== null) {
    query = query.or(`company_id.is.null,company_id.eq.${companyId}`);
  }
  const { data, error } = await query;
  return { data: (data ?? null) as CredentialRow[] | null, error };
}

/** Aplica ao trace o fecho que a decisão pura escolheu. */
async function closeTrace(
  act: Awaited<ReturnType<typeof startAction>>,
  trace: TraceClosure,
): Promise<void> {
  if (trace.close === "handOff") return act.handOff();
  if (trace.close === "skipped") return act.skipped(trace.reason);
  return act.failure(trace.message);
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

  const { data: companyData, error: companyError } = await admin
    .from("companies")
    .select("id, team_id, status, nif, toconline_company_id, toconline_cluster")
    .eq("id", companyId)
    .maybeSingle();
  // A decisão (404 para o que não é desta equipa, 500 para o que não se
  // conseguiu ler) vive numa função pura — ver `companyForEnqueue`.
  const resolved = companyForEnqueue(
    { data: (companyData ?? null) as CompanyRow | null, error: companyError },
    teamId,
  );
  if (!resolved.ok) return { ok: false, status: resolved.status, error: resolved.error };
  const company = resolved.company;

  const access = getAtAccessMode();
  const provider = providerForAccess(access);
  const credentials = await accessCredentials(admin, teamId, companyId);
  // Sem esta guarda, uma leitura falhada daria `candidates = []`, a prontidão
  // diria `credential_missing` e o operador iria configurar uma credencial que
  // está lá — a mandar-se corrigir o que não está partido.
  if (credentials.error !== null) return { ok: false, status: 500, error: "Erro interno." };
  const candidates = toCredentialCandidates(credentials.data ?? []);

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

    const inserted = await admin
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

    // Que fecho de trace corresponde a que desfecho da inserção é decisão pura
    // (e testada) — aqui só se executa. A releitura do job em curso entra por
    // parâmetro porque é a única I/O desse caminho.
    const { trace, result } = await resolveJobInsert(
      { data: inserted.data as { id: string } | null, error: inserted.error },
      () => inFlightJobId(admin, companyId),
    );
    await closeTrace(act, trace);
    return result;
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
 *
 * Uma leitura falhada fecha esse mesmo trace com `failure()` e devolve 500. Um
 * lote que não chegou a saber que empresas existem **não** é um lote de zero
 * empresas, e a diferença é toda para o operador: «0 enfileiradas» a verde é
 * algo que ele arruma como feito.
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

  const batchId = crypto.randomUUID();
  /** O mesmo cabeçalho para o trace do lote, corra ele bem ou mal. */
  const batchMeta = (payload: Record<string, unknown>) => ({
    triggerSource: "documentos.iva.fetch_all",
    type: "job.batch_enqueued",
    createdBy: actor.id,
    correlationKey: `team:${teamId}:iva`,
    payload: { teamId, batchId, provider, ...payload },
  });

  let batch: Awaited<ReturnType<typeof startAction>> | undefined;
  try {
    const [companiesRead, credentialsRead, inFlightRead, listingRead] = await Promise.all([
      admin
        .from("companies")
        .select("id, status, nif, toconline_company_id, toconline_cluster")
        .eq("team_id", teamId)
        .order("name"),
      // Sem `companyId`: o lote precisa também dos marcadores por empresa, que
      // são o que impede uma senha já recusada de ser tentada 182 vezes.
      accessCredentials(admin, teamId, null),
      admin
        .from("jobs")
        .select("company_id")
        .eq("team_id", teamId)
        .eq("type", IVA_DOCUMENT_JOB_TYPE)
        .in("status", ["pending", "running"]),
      // `null` e não uma leitura vazia quando `onlyMissing` é falso: aí o último
      // desfecho não interessa a ninguém e a listagem inteira nem se lê.
      opts.onlyMissing ? readIvaDocuments(teamId) : null,
    ]);

    const planned = bulkRowsFromReads({
      access,
      companies: {
        data: (companiesRead.data ?? null) as BulkCompany[] | null,
        error: companiesRead.error,
      },
      credentials: credentialsRead,
      inFlight: {
        data: (inFlightRead.data ?? null) as { company_id: string | null }[] | null,
        error: inFlightRead.error,
      },
      listing: listingRead,
    });

    if (!planned.ok) {
      // Falhar alto, e com trace. Seguir em frente daria um lote de zero
      // empresas — «0 enfileiradas» a verde durante uma indisponibilidade, que o
      // operador arruma como feito. O trace abre-se só para ser falhado: sem
      // ele, o 500 que ele vê não teria explicação nenhuma em /logs.
      batch = await startAction(batchMeta({ readFailed: true }));
      await batch.failure(planned.error);
      return { ok: false, status: 500, error: "Erro interno." };
    }

    const plan = planBulkFetch(planned.rows, { onlyMissing: opts.onlyMissing, now: new Date() });
    batch = await startAction(
      batchMeta({
        planned: plan.toEnqueue.length,
        skippedInFlight: plan.skipped.alreadyRunning.length,
        skippedNotReady: Object.values(plan.skipped.notReady).reduce((n, ids) => n + ids.length, 0),
        skippedFetched: plan.skipped.alreadyFetched.length,
      }),
    );

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
