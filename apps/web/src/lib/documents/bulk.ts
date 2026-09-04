import {
  CREDENTIAL_STATUSES,
  INTEGRATION_PROVIDERS,
  ivaFetchReadiness,
  planBulkFetch,
  type AtAccessMode,
  type BulkRow,
  type CredentialCandidate,
  type CredentialStatus,
  type IntegrationProvider,
  type IvaNotReadyReason,
  type IvaOutcome,
} from "@toc/core/domain";
import { deriveState, type IvaDocumentRow } from "./present";

/**
 * As decisões puras do «buscar» — tudo o que não é I/O.
 *
 * Vivem fora de `service.ts` por um motivo prático: o serviço importa
 * `server-only` e o cliente Supabase, e nada disso arranca sob o Vitest. O
 * serviço fica a ser a casca que lê, escreve e fecha traces; aqui está **o que
 * ele decide** — a tradução das linhas, a concordância entre prontidão e escolha
 * de credencial, o que fazer com o resultado de uma inserção, e a soma das
 * contagens de um lote. É a fronteira que torna estas regras testáveis sem
 * levantar a aplicação.
 */

/** Linha de `integration_credentials` tal como o cliente admin a devolve. */
export interface CredentialRow {
  id: string;
  provider: string;
  company_id: string | null;
  status: string;
  secret_encrypted: string | null;
  metadata: Record<string, unknown> | null;
}

function knownProvider(value: string): IntegrationProvider | null {
  return INTEGRATION_PROVIDERS.find((p) => p === value) ?? null;
}

function knownStatus(value: string): CredentialStatus | null {
  return CREDENTIAL_STATUSES.find((s) => s === value) ?? null;
}

/**
 * Linha de `integration_credentials_safe` — a view que o dashboard pode ler.
 *
 * A view **não tem** `secret_encrypted` (o ciphertext não chega ao browser por
 * construção); da existência do segredo só chega `has_secret`, que é a mesma
 * pergunta que o domínio faz.
 */
export interface SafeCredentialRow {
  id: string;
  provider: string;
  company_id: string | null;
  status: string;
  has_secret: boolean;
  metadata: Record<string, unknown> | null;
}

/**
 * Linhas da BD → candidatos do domínio.
 *
 * Um provider ou estado que este build não conhece é **descartado**, não
 * adivinhado: um candidato com um estado inventado passaria pelo `status !==
 * "active"` de `selectAccessCredential` e bloquearia a rota por engano.
 *
 * O que não é descartado é a linha sem segredo — o *marcador* que o worker
 * escreve quando o portal recusa a senha. É precisamente ele que tem de chegar
 * ao domínio, porque é ele que impede a próxima tentativa.
 */
export function toSafeCredentialCandidates(
  rows: readonly SafeCredentialRow[],
): CredentialCandidate[] {
  const out: CredentialCandidate[] = [];
  for (const row of rows) {
    const provider = knownProvider(row.provider);
    const status = knownStatus(row.status);
    if (provider === null || status === null) continue;

    const candidate: CredentialCandidate = {
      id: row.id,
      provider,
      companyId: row.company_id,
      status,
      hasSecret: row.has_secret,
    };
    const reason = row.metadata?.invalidReason;
    if (typeof reason === "string") candidate.invalidReason = reason;
    out.push(candidate);
  }
  return out;
}

/**
 * O mesmo, a partir da tabela (service role, com o ciphertext à vista).
 *
 * Delega de propósito: a regra do que se descarta e do que significa "tem
 * segredo" é uma só, e é a página e o serviço a lerem-na de sítios diferentes
 * que a faria divergir.
 */
export function toCredentialCandidates(rows: readonly CredentialRow[]): CredentialCandidate[] {
  return toSafeCredentialCandidates(
    rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      company_id: row.company_id,
      status: row.status,
      has_secret: row.secret_encrypted !== null,
      metadata: row.metadata,
    })),
  );
}

/**
 * A credencial que `ivaFetchReadiness` tem de ver — a mesma que
 * `selectAccessCredential` vai escolher.
 *
 * A ordem de procura é copiada de lá de propósito (marcador da empresa →
 * credencial da empresa → credencial da equipa, ou a do TOConline na rota A):
 * se as duas divergissem, o botão diria «pronta» e o serviço recusaria logo a
 * seguir, ou o «buscar todas» encheria a fila de jobs condenados.
 *
 * O marcador é o caso subtil. Ele não tem segredo, e `ivaFetchReadiness` testa
 * a ausência de segredo **antes** do estado — dizer a verdade («não tem
 * segredo») faria a interface pedir «configure o acesso à AT» quando o que o
 * operador tem de fazer é corrigir a palavra-passe. Por isso o que sai daqui é
 * o que o marcador **significa**: existe uma senha, e o portal recusou-a.
 */
export function credentialForReadiness(
  access: AtAccessMode,
  companyId: string,
  candidates: readonly CredentialCandidate[],
): { hasSecret: boolean; status: string } | null {
  const blocked = candidates.find(
    (c) => c.provider === "at" && c.companyId === companyId && c.status !== "active",
  );
  if (blocked !== undefined) return { hasSecret: true, status: blocked.status };

  const chosen =
    access === "toconline_direct_access"
      ? candidates.find((c) => c.provider === "toconline" && c.companyId === null)
      : (candidates.find((c) => c.provider === "at" && c.companyId === companyId) ??
        candidates.find((c) => c.provider === "at" && c.companyId === null));

  if (chosen === undefined) return null;
  return { hasSecret: chosen.hasSecret, status: chosen.status };
}

/** As colunas de `companies` de que a prontidão precisa, e mais nenhuma. */
export interface BulkCompany {
  id: string;
  status: string;
  nif: string | null;
  toconline_company_id: number | null;
  toconline_cluster: number | null;
}

/** O último job terminal desta empresa, já lido da listagem. */
export interface LastFetch {
  outcome: IvaOutcome | null;
  finishedAt: string | null;
}

/** Empresas + credenciais + jobs em curso → as linhas que `planBulkFetch` reparte. */
export function buildBulkRows(input: {
  access: AtAccessMode;
  companies: readonly BulkCompany[];
  candidates: readonly CredentialCandidate[];
  inFlight: ReadonlySet<string>;
  lastByCompany: ReadonlyMap<string, LastFetch>;
}): BulkRow[] {
  return input.companies.map((company) => {
    const last = input.lastByCompany.get(company.id);
    return {
      companyId: company.id,
      readiness: ivaFetchReadiness({
        access: input.access,
        company: {
          status: company.status,
          tocCompanyId: company.toconline_company_id,
          tocCluster: company.toconline_cluster,
          nif: company.nif,
        },
        credential: credentialForReadiness(input.access, company.id, input.candidates),
        inFlight: input.inFlight.has(company.id),
      }),
      lastOutcome: last?.outcome ?? null,
      lastFinishedAt: last?.finishedAt ?? null,
    };
  });
}

export type BulkPlan = ReturnType<typeof planBulkFetch>;

/** O que cada `enqueueIvaFetch` de um lote acabou por fazer. */
export type EnqueueOutcome = "enqueued" | "already_running" | "failed";

export interface BulkCounts {
  enqueued: number;
  skipped: { alreadyRunning: number; notReady: number; alreadyFetched: number };
  /** Só os motivos com empresas — a interface não tem de mostrar zeros. */
  notReadyReasons: Partial<Record<IvaNotReadyReason, number>>;
}

/**
 * Quantas empresas não estão prontas, e por que motivos — só os que têm
 * empresas: a interface não tem de mostrar zeros.
 */
function notReadyTally(plan: BulkPlan): {
  notReady: number;
  notReadyReasons: Partial<Record<IvaNotReadyReason, number>>;
} {
  const notReadyReasons: Partial<Record<IvaNotReadyReason, number>> = {};
  let notReady = 0;
  for (const [reason, ids] of Object.entries(plan.skipped.notReady) as [
    IvaNotReadyReason,
    string[],
  ][]) {
    if (ids.length === 0) continue;
    notReadyReasons[reason] = ids.length;
    notReady += ids.length;
  }
  return { notReady, notReadyReasons };
}

export interface BulkPlanSummary {
  /** Quantas seriam enfileiradas se o lote saísse agora. */
  ready: number;
  inFlight: number;
  notReady: number;
  alreadyFetched: number;
  notReadyReasons: Partial<Record<IvaNotReadyReason, number>>;
}

/**
 * O plano em números, para o diálogo de confirmação anunciar o que vai fazer
 * **antes** de o fazer.
 *
 * A página calcula o plano com a mesma `planBulkFetch` que o serviço vai
 * correr: se os dois divergissem, o diálogo prometeria 40 empresas e o resumo
 * de fim diria 12, sem ninguém saber qual dos dois mentiu.
 */
export function summarizeBulkPlan(plan: BulkPlan): BulkPlanSummary {
  const { notReady, notReadyReasons } = notReadyTally(plan);
  return {
    ready: plan.toEnqueue.length,
    inFlight: plan.skipped.alreadyRunning.length,
    notReady,
    alreadyFetched: plan.skipped.alreadyFetched.length,
    notReadyReasons,
  };
}

/**
 * O plano mais o que realmente aconteceu.
 *
 * As duas fontes somam-se porque o plano é uma fotografia: entre planear e
 * enfileirar, outra pessoa pode ter lançado a busca da mesma empresa (`23505` →
 * `already_running`) ou a credencial pode ter sido apagada (`failed`). Contar só
 * o plano mostraria «5 enfileiradas» quando foram 3.
 */
export function tallyBulk(plan: BulkPlan, outcomes: readonly EnqueueOutcome[]): BulkCounts {
  let enqueued = 0;
  let racedIn = 0;
  let refused = 0;
  for (const outcome of outcomes) {
    if (outcome === "enqueued") enqueued += 1;
    else if (outcome === "already_running") racedIn += 1;
    else refused += 1;
  }

  const { notReady, notReadyReasons } = notReadyTally(plan);

  return {
    enqueued,
    skipped: {
      alreadyRunning: plan.skipped.alreadyRunning.length + racedIn,
      notReady: notReady + refused,
      alreadyFetched: plan.skipped.alreadyFetched.length,
    },
    notReadyReasons,
  };
}

// --- Leituras: o que fazer quando uma delas falha -----------------------------

/**
 * O que uma leitura do PostgREST devolve, com o erro **por tratar**.
 *
 * O cliente Supabase nunca lança: devolve `{ data, error }` e cabe a quem chama
 * olhar para o segundo. O tipo existe para que olhar seja obrigatório — um
 * `data ?? []` solto transforma uma indisponibilidade da base numa lista vazia,
 * e uma lista vazia é uma resposta perfeitamente plausível.
 */
export interface ReadResult<T> {
  data: T[] | null;
  error: { message?: string } | null;
}

export type BulkRowsResult = { ok: true; rows: BulkRow[] } | { ok: false; error: string };

/** Devolve a primeira leitura falhada, já rotulada para o trace. */
function firstReadError(reads: [string, ReadResult<unknown> | null][]): string | null {
  for (const [label, read] of reads) {
    if (read !== null && read.error !== null) {
      return `leitura de ${label}: ${read.error.message ?? "erro desconhecido"}`;
    }
  }
  return null;
}

/**
 * As quatro leituras do «buscar todas» → as linhas que `planBulkFetch` reparte.
 *
 * **Qualquer erro falha o lote inteiro**, e essa é a decisão que este módulo
 * existe para tornar testável. Um lote que não chegou a saber que empresas
 * existem não é um lote de zero empresas: seguir em frente mostraria «0
 * enfileiradas» a verde durante uma indisponibilidade, e o operador arrumaria o
 * assunto como feito.
 *
 * A listagem merece nota à parte, porque a sua falha é a mais cara das quatro:
 * é dela que sai o último desfecho de cada empresa, e sem ele `onlyMissing`
 * conclui que nada foi buscado este mês — 182 sessões de browser contra o
 * portal por causa de uma leitura falhada. `null` (e não uma leitura vazia)
 * quando `onlyMissing` é falso: aí a listagem nem se lê.
 */
export function bulkRowsFromReads(input: {
  access: AtAccessMode;
  companies: ReadResult<BulkCompany>;
  credentials: ReadResult<CredentialRow>;
  inFlight: ReadResult<{ company_id: string | null }>;
  listing: ReadResult<IvaDocumentRow> | null;
}): BulkRowsResult {
  const failed = firstReadError([
    ["empresas", input.companies],
    ["credenciais", input.credentials],
    ["jobs em curso", input.inFlight],
    ["listagem", input.listing],
  ]);
  if (failed !== null) return { ok: false, error: failed };

  const inFlight = new Set(
    (input.inFlight.data ?? [])
      .map((job) => job.company_id)
      .filter((id): id is string => id !== null),
  );

  const lastByCompany = new Map<string, LastFetch>();
  for (const row of input.listing?.data ?? []) {
    lastByCompany.set(row.company_id, {
      outcome: deriveState(row).outcome,
      finishedAt: row.job_finished_at,
    });
  }

  return {
    ok: true,
    rows: buildBulkRows({
      access: input.access,
      companies: input.companies.data ?? [],
      candidates: toCredentialCandidates(input.credentials.data ?? []),
      inFlight,
      lastByCompany,
    }),
  };
}

// --- Inserção do job: o resultado, o trace e o que o operador lê --------------

const ENQUEUE_STATUSES = [400, 401, 403, 404, 500] as const;
/** Os únicos códigos que o serviço devolve — nunca um 5xx do Postgres em bruto. */
export type IvaEnqueueStatus = (typeof ENQUEUE_STATUSES)[number];

export type IvaEnqueueResult =
  | { ok: true; jobId: string; alreadyRunning: boolean }
  | { ok: false; status: IvaEnqueueStatus; error: string };

/** `requireWriterOn` devolve `number`; aqui o tipo volta a ser fechado, sem `as`. */
export function enqueueStatus(status: number): IvaEnqueueStatus {
  return ENQUEUE_STATUSES.find((s) => s === status) ?? 500;
}

/** Como se fecha o trace de um enfileiramento. */
export type TraceClosure =
  | { close: "handOff" }
  | { close: "skipped"; reason: string }
  | { close: "failure"; message: string };

export interface EnqueueResolution {
  trace: TraceClosure;
  result: IvaEnqueueResult;
}

/** O 5xx que o operador lê. A mensagem do Postgres fica no trace, nunca no ecrã. */
const INTERNAL: IvaEnqueueResult = { ok: false, status: 500, error: "Erro interno." };

/**
 * O que fazer depois de tentar inserir o job.
 *
 * Três desfechos, três fechos de trace diferentes, e é essa correspondência que
 * importa acertar:
 * - inserido → **`handOff`**: o trace fica aberto até o worker terminar, porque
 *   um job enfileirado e nunca consumido tem de aparecer como trace por fechar.
 * - `23505` (o índice parcial `jobs_company_inflight_uq` recusou o duplicado) →
 *   **`skipped`**: não é falha de ninguém, e fechar como erro mandaria alguém
 *   investigar um duplo-clique. Devolve-se o job que já lá estava.
 * - qualquer outro erro → **`failure`**, com a mensagem crua no trace e uma
 *   genérica para o ecrã.
 *
 * `inFlight` entra por parâmetro porque é a única I/O deste caminho — e é o que
 * permite exercitar o ramo do `23505` sem uma base de dados a recusar chaves.
 */
export async function resolveJobInsert(
  insert: { data: { id: string } | null; error: { code?: string; message?: string } | null },
  inFlight: () => Promise<string | null>,
): Promise<EnqueueResolution> {
  if (insert.error !== null) {
    if (insert.error.code !== "23505") {
      return {
        trace: { close: "failure", message: insert.error.message ?? "erro desconhecido" },
        result: INTERNAL,
      };
    }
    const raced = await inFlight();
    return {
      // Saltado mesmo quando a releitura vem vazia: o enfileiramento **foi**
      // saltado por conflito; o que falhou a seguir foi só ter o que devolver
      // (o job terminou entretanto — raríssimo, e quem chamou volta a tentar).
      trace: { close: "skipped", reason: "already_running" },
      result: raced === null ? INTERNAL : { ok: true, jobId: raced, alreadyRunning: true },
    };
  }

  // Sem erro e sem linha não acontece com `.single()`, mas devolver `ok` a
  // partir de um `id` que não existe seria pior do que uma falha honesta.
  if (insert.data === null) {
    return { trace: { close: "failure", message: "inserção sem linha" }, result: INTERNAL };
  }
  return {
    trace: { close: "handOff" },
    result: { ok: true, jobId: insert.data.id, alreadyRunning: false },
  };
}

// --- As opções que vêm do formulário ------------------------------------------

/**
 * Valor do campo escondido que pede a re-busca.
 *
 * Uma constante e não o literal em dois sítios porque quem o escreve
 * (`FetchButton`) e quem o lê (a Server Action) estão em processos diferentes:
 * uma divergência entre os dois não daria erro nenhum — o botão «Buscar
 * novamente» ficaria a enfileirar jobs que o worker fecha como
 * `already_fetched`, e a re-busca seria um beco sem saída silencioso.
 */
export const FORCE_FLAG = "1";

/** `force=1` do formulário → o flag que o serviço passa ao payload do job. */
export function forceFromForm(value: FormDataEntryValue | null): boolean {
  return value === FORCE_FLAG;
}

/**
 * O checkbox «ignorar as já obtidas» → a opção do lote.
 *
 * Um checkbox só chega ao `FormData` quando está marcado (com o valor `"on"`),
 * e é por isso que a ausência **tem** de valer `false`: um `?? true` faria o
 * lote saltar empresas que o operador acabou de mandar rebuscar.
 */
export function onlyMissingFromForm(value: FormDataEntryValue | null): boolean {
  return value === "on";
}
