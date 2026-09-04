import {
  IVA_OUTCOME_CODES,
  ivaFetchReadiness,
  renderGuidance,
  type AtAccessMode,
  type IvaNotReadyReason,
  type IvaOutcome,
  type IvaOutcomeDetails,
  type IvaReadiness,
} from "@toc/core/domain";
import {
  UI_STATES,
  UI_STATE_META,
  rowStateMeta,
  type BadgeTone,
  type IvaRowState,
  type UiState,
} from "./outcomes";

/**
 * Da linha da base de dados à linha do ecrã — e nada mais.
 *
 * Pura de propósito (sem `next/*`, sem Supabase, sem `Date.now()`): é aqui que
 * está a decisão de o botão «Buscar» estar ou não desligado e porquê, e essa
 * decisão vale a pena poder testar sem levantar a aplicação. O `now` entra por
 * parâmetro pela mesma razão.
 */

/**
 * Uma linha de `public.iva_documents_overview`, 1:1 com as colunas da view.
 *
 * Nomes em `snake_case` porque é assim que o PostgREST as devolve — traduzir
 * aqui daria dois nomes para a mesma coluna. Repare no que **não** existe:
 * `storage_path` nunca sai da base de dados (quem o soubesse podia pedir a
 * signed URL de outra equipa); da existência do ficheiro só chega `has_file`.
 */
export interface IvaDocumentRow {
  company_id: string;
  team_id: string;
  company_name: string;
  nif: string | null;
  company_status: string;
  toconline_company_id: number | null;
  toconline_cluster: number | null;
  period_id: string | null;
  period: string | null;
  period_status: string | null;
  due_date: string | null;
  document_id: string | null;
  entity: string | null;
  reference: string | null;
  /** `numeric(12,2)`: consoante o cliente chega como número ou como texto. */
  amount: string | number | null;
  valid_until: string | null;
  document_status: string | null;
  has_file: boolean;
  extracted_at: string | null;
  job_id: string | null;
  job_status: string | null;
  job_outcome: string | null;
  job_period: string | null;
  job_batch_id: string | null;
  job_error: string | null;
  job_trace_id: string | null;
  job_attempts: number | null;
  job_created_at: string | null;
  job_finished_at: string | null;
}

export interface IvaRowView {
  state: IvaRowState;
  label: string;
  tone: BadgeTone;
  /** Uma linha por baixo do crachá. */
  short: string;
  /** O que fazer, por extenso e com o período/prazo já preenchidos. */
  guidance: string;
  inFlight: boolean;
  readiness: IvaReadiness;
  canFetch: boolean;
  /** Presente só quando `canFetch` é falso — vai para o `title` do botão. */
  disabledReason?: string;
  fetchLabel: "Buscar" | "Buscar novamente";
  /** `null` nos estados que não são desfecho do domínio. */
  outcome: IvaOutcome | null;
  details: IvaOutcomeDetails;
}

/** Estados em que ainda não há desfecho — a busca não terminou (ou nunca houve). */
const UI_STATE_SET: ReadonlySet<string> = new Set(UI_STATES);

function isUiState(state: IvaRowState): state is UiState {
  return UI_STATE_SET.has(state);
}

function toOutcome(value: string | null): IvaOutcome | null {
  if (value === null) return null;
  return (IVA_OUTCOME_CODES as readonly string[]).includes(value) ? (value as IvaOutcome) : null;
}

/**
 * O estado da linha a partir do último job.
 *
 * A view achata `jobs.result` / `jobs.last_error` num único `job_outcome`
 * (`coalesce(result->>'outcome', result->>'reason', last_error->>'outcome')`),
 * por isso aqui não é preciso repetir a leitura das três formas que
 * `readIvaOutcome` conhece — basta reconhecer o código. O que a view **não**
 * traz reconstrói-se do que traz: o período do job, ou o do período da
 * obrigação, e o prazo de pagamento.
 *
 * Um código que este build não conhece (linha antiga, worker mais recente) cai
 * em `failed_unknown` com `outcome: null`: sem desfecho não há orientação de
 * domínio para mostrar, e inventar uma seria pior do que dizer "veja o trace".
 */
export function deriveState(row: IvaDocumentRow): {
  state: IvaRowState;
  outcome: IvaOutcome | null;
  details: IvaOutcomeDetails;
} {
  const details: IvaOutcomeDetails = {};
  const period = row.job_period ?? row.period;
  if (period !== null) details.period = period;
  if (row.due_date !== null) details.dueDate = row.due_date;

  if (row.job_status === null) return { state: "never", outcome: null, details };
  if (row.job_status === "pending") return { state: "queued", outcome: null, details };
  if (row.job_status === "running") return { state: "running", outcome: null, details };

  const outcome = toOutcome(row.job_outcome);
  if (outcome === null) return { state: "failed_unknown", outcome: null, details };
  return { state: outcome, outcome, details };
}

/**
 * Por que motivo o botão está desligado, em PT-PT.
 *
 * O texto genérico serve as duas rotas; só a credencial muda, porque na rota A
 * quem falha é a ligação ao TOConline e na rota B é o acesso à AT — mandar o
 * operador ao ecrã errado custa-lhe uma volta inteira.
 */
export const NOT_READY_COPY: Record<IvaNotReadyReason, string> = {
  in_flight: "Busca já em curso.",
  company_inactive: "Empresa inativa.",
  company_not_linked: "Sem ligação ao TOConline — corra a varredura.",
  nif_missing: "Empresa sem NIF.",
  credential_missing: "Configure o acesso à AT.",
  credential_invalid: "Acesso à AT inválido — atualize a palavra-passe.",
};

/** A cópia da rota A, para os dois motivos em que o dono da senha muda. */
const DIRECT_ACCESS_COPY: Partial<Record<IvaNotReadyReason, string>> = {
  credential_missing: "Configure a ligação ao TOConline.",
  credential_invalid: "Ligação ao TOConline inválida — atualize a palavra-passe.",
};

export function notReadyCopy(reason: IvaNotReadyReason, access: AtAccessMode): string {
  if (access === "toconline_direct_access") {
    return DIRECT_ACCESS_COPY[reason] ?? NOT_READY_COPY[reason];
  }
  return NOT_READY_COPY[reason];
}

export function presentIvaRow(
  row: IvaDocumentRow,
  ctx: {
    access: AtAccessMode;
    /** A credencial do provider da rota (`providerForAccess`), já resolvida. */
    credential: { hasSecret: boolean; status: string } | null;
    now: Date;
  },
): IvaRowView {
  const { state, outcome, details } = deriveState(row);
  const inFlight = state === "queued" || state === "running";
  const meta = rowStateMeta(state);

  const readiness = ivaFetchReadiness({
    access: ctx.access,
    company: {
      status: row.company_status,
      tocCompanyId: row.toconline_company_id,
      tocCluster: row.toconline_cluster,
      nif: row.nif,
    },
    credential: ctx.credential,
    inFlight,
  });

  const canFetch = readiness.ready && !inFlight;
  // `ivaFetchReadiness` já devolve `in_flight` em primeiro lugar; o ramo é para
  // o caso de alguém vir a chamá-la sem esse sinal — o botão continua a saber
  // dizer porque está desligado.
  const reason: IvaNotReadyReason | null = readiness.ready
    ? inFlight
      ? "in_flight"
      : null
    : readiness.reason;

  // Um job terminal é o que distingue «Buscar» de «Buscar novamente»: nunca
  // buscada ou ainda a correr, o verbo é o primeiro.
  const terminal = !inFlight && state !== "never";

  const view: IvaRowView = {
    state,
    label: meta.label,
    tone: meta.tone,
    short: meta.short,
    // Nos estados de UI não há orientação de domínio — a linha curta é tudo o
    // que há para dizer, e repeti-la é melhor do que uma orientação inventada.
    // Fora deles o estado **é** um desfecho, e a orientação vem do domínio.
    guidance: isUiState(state) ? UI_STATE_META[state].short : renderGuidance(state, details),
    inFlight,
    readiness,
    canFetch,
    fetchLabel: terminal ? "Buscar novamente" : "Buscar",
    outcome,
    details,
  };
  if (reason !== null) view.disabledReason = notReadyCopy(reason, ctx.access);
  return view;
}

/**
 * Dias 20 a 25 — o pico de entregas do IVA, em que o Portal das Finanças
 * responde mal (é o que diz a orientação de `at_unavailable`).
 *
 * Lê-se do relógio local de propósito: o servidor corre em Europe/Lisbon e o
 * operador também, e o aviso só tem de estar certo ao dia. Comparar em UTC
 * daria um dia errado nas horas de fronteira do horário de verão.
 */
export function isPeakDay(now: Date): boolean {
  const day = now.getDate();
  return day >= 20 && day <= 25;
}

const EUR = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });

/** Travessão e não `0,00 €`: "não sabemos" não é o mesmo que "zero". */
const EMPTY = "—";

export function formatEur(amount: string | number | null): string {
  if (amount === null) return EMPTY;
  const value = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(value)) return EMPTY;
  return EUR.format(value);
}

/** `2026-09-25` (ou o timestamp que o começa) → `25/09/2026`. */
export function formatDatePt(iso: string | null): string {
  if (iso === null) return EMPTY;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return EMPTY;
  return `${match[3]}/${match[2]}/${match[1]}`;
}
