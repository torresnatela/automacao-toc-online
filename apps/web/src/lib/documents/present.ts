import {
  AT_ACCESS_MODES,
  IVA_OUTCOMES,
  IVA_OUTCOME_CODES,
  credentialStatusLabel,
  ivaFetchReadiness,
  providerForAccess,
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
 * está a decisão de cada botão de busca estar ou não desligado e porquê, e essa
 * decisão vale a pena poder testar sem levantar a aplicação.
 *
 * Duas funções porque são duas perguntas: `presentIvaRow` diz **em que estado
 * está a linha** (não depende da rota — o último job é o que é), e
 * `fetchAffordance` diz **se se pode buscar por uma dada rota** (depende dela:
 * a rota A precisa da ligação ao TOConline, a B do NIF e da credencial da AT).
 * A rota é a escolha do operador em cada clique, não uma configuração do
 * sistema — por isso a linha tem um botão por rota, e cada um responde por si.
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
  /**
   * O job está `pending` porque o SISTEMA o adiou (pausa do portal), e não
   * porque ninguém lhe pegou ainda. `coalesce` na view: nunca `null`.
   */
  job_deferred: boolean;
  /**
   * Por que rota correu o último job (`payload->>'access'`), em texto cru: a
   * view não valida nada, `deriveState` é que o traduz numa `AtAccessMode` (ou
   * em nada). `null` sem job, ou num job anterior a esta coluna.
   */
  job_access: string | null;
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
  /** `null` nos estados que não são desfecho do domínio. */
  outcome: IvaOutcome | null;
  details: IvaOutcomeDetails;
  /**
   * Por que rota correu o último job — o que a listagem mostra ao lado do
   * estado e o que decide para que ecrã manda o link da credencial. `null`
   * sem job, ou quando o job não gravou rota (anterior à coluna `job_access`).
   */
  lastAccess: AtAccessMode | null;
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
 * **Porque não `readIvaOutcome`**: o leitor canónico do domínio recebe a LINHA
 * do job (`result`, `last_error`, `status`) e é ele que sabe ler as três formas
 * em que um desfecho pode estar escrito. Aqui não há linha de job — há uma
 * linha da view, que já achatou essas três formas num único `job_outcome`
 * (`coalesce(result->>'outcome', result->>'reason', last_error->>'outcome')`) e
 * deliberadamente NÃO expõe os jsonb crus ao browser. Chamar `readIvaOutcome`
 * obrigaria a view a devolver `result` e `last_error` inteiros — e com eles
 * tudo o que lá caia, incluindo o que ninguém decidiu mandar para o cliente.
 * Então a web reconstrói o desfecho das colunas que a view escolheu dar, e o
 * leitor canónico continua a servir o worker, que tem a linha toda.
 *
 * O que a view **não** traz reconstrói-se do que traz: o período do job, ou o
 * do período da obrigação, o prazo de pagamento e a rota por que o job correu
 * (validada contra `AT_ACCESS_MODES`, como faz o leitor canónico — um texto que
 * este build não conhece não é rota nenhuma).
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
  const access = AT_ACCESS_MODES.find((mode) => mode === row.job_access);
  if (access !== undefined) details.access = access;

  if (row.job_status === null) return { state: "never", outcome: null, details };
  if (row.job_status === "pending") {
    // Duas esperas diferentes com o mesmo `pending`: "ninguém lhe pegou ainda"
    // e "o sistema pausou o acesso ao portal e retoma sozinho". Sem as separar,
    // uma indisponibilidade da AT aparecia como 182 empresas eternamente na
    // fila — e ninguém saberia que não há nada a fazer senão esperar.
    return row.job_deferred
      ? { state: "portal_paused", outcome: "portal_paused", details }
      : { state: "queued", outcome: null, details };
  }
  if (row.job_status === "running") return { state: "running", outcome: null, details };

  const outcome = toOutcome(row.job_outcome);
  if (outcome === null) return { state: "failed_unknown", outcome: null, details };
  return { state: outcome, outcome, details };
}

/**
 * O `last_error` do último job, mas só quando ele é o que a linha está a dizer.
 *
 * `jobs.last_error` sobrevive à linha: o `defer` escreve-o e o `complete`/`skip`
 * seguintes trabalham na MESMA linha. A fila já o limpa (`job-queue.ts`), e isto
 * é o cinto por cima dos suspensórios — uma linha antiga na base, ou um worker
 * mais velho a escrever, não pode pôr «Portal em baixo» debaixo de um selo
 * verde. `null` quando não há falha a comentar.
 */
export function jobErrorFor(row: IvaDocumentRow): string | null {
  return row.job_status === "failed" ? row.job_error : null;
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

/** O estado da linha, tal como o ecrã o mostra — igual seja qual for a rota. */
export function presentIvaRow(row: IvaDocumentRow): IvaRowView {
  const { state, outcome, details } = deriveState(row);
  const meta = rowStateMeta(state);

  return {
    state,
    label: meta.label,
    tone: meta.tone,
    short: meta.short,
    // Nos estados de UI não há orientação de domínio — a linha curta é tudo o
    // que há para dizer, e repeti-la é melhor do que uma orientação inventada.
    // Fora deles o estado **é** um desfecho, e a orientação vem do domínio.
    guidance: isUiState(state) ? UI_STATE_META[state].short : renderGuidance(state, details),
    inFlight: isInFlight(row.job_status),
    outcome,
    details,
    lastAccess: details.access ?? null,
  };
}

/** O que um botão de busca precisa de saber sobre a SUA rota. */
export interface FetchAffordance {
  access: AtAccessMode;
  readiness: IvaReadiness;
  canFetch: boolean;
  /** Presente só quando `canFetch` é falso — `title` + sr-only do botão. */
  disabledReason?: string;
  /** Nome acessível do botão (`fetchButtonLabel`). */
  label: string;
  /**
   * Houve job terminal: o verbo é «novamente» e a busca força (`force`). É
   * explícito, e não deduzido do rótulo, porque é ele que decide se o
   * formulário força a re-busca — um rótulo novo não o pode desligar em
   * silêncio.
   */
  refetch: boolean;
}

/**
 * Se esta linha se pode buscar por esta rota, e porquê não.
 *
 * A credencial entra **já resolvida para a rota** (`credentialForReadiness`):
 * a da AT na rota B, a do TOConline na rota A. É a mesma prontidão que o
 * serviço recalcula ao receber o clique, com a mesma função do domínio — se as
 * duas divergissem, o botão diria «pronta» e o clique seria recusado a seguir.
 */
export function fetchAffordance(
  row: IvaDocumentRow,
  ctx: { access: AtAccessMode; credential: { hasSecret: boolean; status: string } | null },
): FetchAffordance {
  const { state } = deriveState(row);
  // Lido do estado do JOB e não do estado derivado: um job adiado continua na
  // fila (`pending`, sem tentativa gasta) e a mesma execução retoma daqui a 15
  // minutos, por isso «Portal em pausa» é uma busca em curso — não uma
  // terminada. Derivá-lo do estado poria o botão a convidar a um segundo
  // pedido que o índice de idempotência recusaria de imediato.
  const inFlight = isInFlight(row.job_status);

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
  const refetch = !inFlight && state !== "never";

  const affordance: FetchAffordance = {
    access: ctx.access,
    readiness,
    canFetch,
    label: fetchButtonLabel(ctx.access, refetch),
    refetch,
  };
  if (reason !== null) affordance.disabledReason = notReadyCopy(reason, ctx.access);
  return affordance;
}

/**
 * A decisão de cada rota para esta linha — as duas, sempre.
 *
 * Objeto literal com uma chave por rota, e não um `reduce` sobre
 * `AT_ACCESS_MODES`: uma rota nova no domínio tem de obrigar a decidir aqui
 * (o `Record` deixa de compilar), em vez de aparecer na listagem sem botão.
 */
export function fetchAffordances(
  row: IvaDocumentRow,
  credentialFor: (access: AtAccessMode) => { hasSecret: boolean; status: string } | null,
): Record<AtAccessMode, FetchAffordance> {
  const forRoute = (access: AtAccessMode) =>
    fetchAffordance(row, { access, credential: credentialFor(access) });
  return {
    at_direct_login: forRoute("at_direct_login"),
    toconline_direct_access: forRoute("toconline_direct_access"),
  };
}

/**
 * O nome do botão: o verbo (houve job terminal?) e a rota.
 *
 * A rota B fica sem sufixo de propósito — «Buscar» é o botão que sempre
 * existiu, e o que o gabinete já conhece; a rota A é a que se anuncia.
 */
export function fetchButtonLabel(access: AtAccessMode, refetch: boolean): string {
  const verb = refetch ? "Buscar novamente" : "Buscar";
  return access === "toconline_direct_access" ? `${verb} via TOConline` : verb;
}

/** Como se chama cada rota quando se diz por qual correu a última tentativa. */
export const ACCESS_LABEL: Record<AtAccessMode, string> = {
  at_direct_login: "login direto na AT",
  toconline_direct_access: "via TOConline",
};

/** A rota da última tentativa por extenso, para a linha do estado; `null` sem rota. */
export function accessHint(access: AtAccessMode | null): string | null {
  return access === null ? null : ACCESS_LABEL[access];
}

/** O botão e o título do diálogo do «buscar todas» de cada rota. */
export const BULK_COPY: Record<AtAccessMode, { button: string; title: string }> = {
  at_direct_login: {
    button: "Buscar todas",
    title: "Buscar guias de IVA de todas as empresas?",
  },
  toconline_direct_access: {
    button: "Buscar todas via TOConline",
    title: "Buscar guias de IVA de todas as empresas via TOConline?",
  },
};

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

/**
 * Motivo de não-prontidão → o sintagma que o resumo do lote usa.
 *
 * Diferente de `NOT_READY_COPY` de propósito: ali é uma frase sobre UMA empresa
 * ("Configure o acesso à AT."), aqui é um sintagma que se conta ("2 sem
 * credencial"). Neutro quanto à rota: quem lê o resumo do lote quer o número,
 * e a instrução (com o ecrã certo) está no banner logo acima.
 */
export const NOT_READY_BULK_COPY: Record<IvaNotReadyReason, string> = {
  in_flight: "em curso",
  company_inactive: "inativas",
  credential_missing: "sem credencial",
  credential_invalid: "com credencial inválida",
  company_not_linked: "sem ligação ao TOConline",
  nif_missing: "sem NIF",
};

/**
 * `{ nif_missing: 3, credential_missing: 2 }` → `"2 sem credencial, 3 sem NIF"`.
 *
 * A ordem é a de declaração do mapa acima (a ordem por que se resolvem os
 * problemas, como em `ivaFetchReadiness`), lida das chaves e não de uma segunda
 * lista — uma lista à parte ficaria para trás no dia em que houver mais um
 * motivo. Motivos a zero não aparecem: um resumo não mostra zeros.
 */
export function formatNotReadyReasons(counts: Partial<Record<IvaNotReadyReason, number>>): string {
  const parts: string[] = [];
  for (const reason of Object.keys(NOT_READY_BULK_COPY) as IvaNotReadyReason[]) {
    const n = counts[reason];
    if (n === undefined || n === 0) continue;
    parts.push(`${n} ${NOT_READY_BULK_COPY[reason]}`);
  }
  return parts.join(", ");
}

export interface BatchProgressCounts {
  batchId: string;
  queued: number;
  running: number;
  /** Terminou e não pede nada a ninguém (severidade `ok`). */
  done: number;
  /** Terminou e pede uma ação ou o suporte (severidade `action`/`support`). */
  attention: number;
}

/** `job_created_at` comparável; uma data ilegível fica no fim da fila. */
function createdAtMs(iso: string | null): number {
  if (iso === null) return 0;
  const time = Date.parse(iso);
  return Number.isNaN(time) ? 0 : time;
}

function isInFlight(status: string | null): boolean {
  return status === "pending" || status === "running";
}

/**
 * O progresso do lote que está a decorrer, a partir das linhas da listagem.
 *
 * Não há tabela de lotes: o que junta 182 jobs é o `batchId` que o serviço põe
 * no `payload` de cada um, e a view devolve-o em `job_batch_id`. Daí o lote «em
 * curso» ser definido pelo que ainda se move — o `batchId` do job em curso mais
 * recente — e não pelo lote com mais linhas ou pelo último criado: um lote já
 * todo terminado não tem progresso nenhum para mostrar.
 *
 * Contadas as linhas desse lote **todas**, não só as em curso: é a diferença
 * entre "faltam 4" e "4 de 182". `wait` (o portal não respondeu, o sistema
 * volta a tentar) não conta como concluída nem como atenção — ninguém tem de
 * agir sobre ela. Um desfecho que este build não reconhece conta como atenção:
 * é literalmente o que a linha diz ao operador ("veja o trace").
 */
export function batchProgress(rows: readonly IvaDocumentRow[]): BatchProgressCounts | null {
  let batchId: string | null = null;
  let newest = -1;
  for (const row of rows) {
    if (!isInFlight(row.job_status) || row.job_batch_id === null) continue;
    const at = createdAtMs(row.job_created_at);
    if (at > newest) {
      newest = at;
      batchId = row.job_batch_id;
    }
  }
  if (batchId === null) return null;

  const counts: BatchProgressCounts = { batchId, queued: 0, running: 0, done: 0, attention: 0 };
  for (const row of rows) {
    if (row.job_batch_id !== batchId) continue;
    if (row.job_status === "pending") {
      counts.queued += 1;
      continue;
    }
    if (row.job_status === "running") {
      counts.running += 1;
      continue;
    }
    const { outcome } = deriveState(row);
    const severity = outcome === null ? "support" : IVA_OUTCOMES[outcome].severity;
    if (severity === "ok") counts.done += 1;
    else if (severity === "action" || severity === "support") counts.attention += 1;
  }
  return counts;
}

/** O ecrã onde se resolve a credencial de cada rota, e como lhe chamar. */
const ACCESS_TARGET: Record<
  "at" | "toconline",
  { href: string; label: string; missing: string; blocked: (status: string) => string }
> = {
  at: {
    href: "/integracoes/at",
    label: "Configurar acesso à AT",
    missing: "Configure o acesso à AT antes de buscar guias.",
    blocked: (status) =>
      `O acesso à AT está marcado como ${status} — guarde uma palavra-passe nova.`,
  },
  toconline: {
    href: "/integracoes/toconline",
    label: "Configurar ligação ao TOConline",
    missing: "Configure a ligação ao TOConline antes de buscar guias.",
    blocked: (status) =>
      `A ligação ao TOConline está marcada como ${status} — guarde uma palavra-passe nova.`,
  },
};

export interface CredentialBanner {
  message: string;
  href: string;
  linkLabel: string;
}

/**
 * O aviso no topo da listagem quando a credencial da rota não serve.
 *
 * É a mesma informação que cada botão desativado já dá no seu `title`, dita uma
 * vez e com o caminho para a resolver: 182 botões desligados pelo mesmo motivo
 * são um problema do gabinete, não de 182 empresas. `null` quando não há nada a
 * dizer — a ausência de banner é o estado normal. Com duas rotas na mesma
 * listagem pode haver um banner por rota.
 */
export function credentialBanner(
  access: AtAccessMode,
  credential: { hasSecret: boolean; status: string } | null,
): CredentialBanner | null {
  const target = ACCESS_TARGET[providerForAccess(access)];
  const link = { href: target.href, linkLabel: target.label };

  if (credential === null || !credential.hasSecret) {
    return { message: target.missing, ...link };
  }
  if (credential.status !== "active") {
    return { message: target.blocked(credentialStatusLabel(credential.status)), ...link };
  }
  return null;
}

/**
 * Onde se resolve cada desfecho, quando o que o resolve é uma credencial.
 *
 * `Record` **total** (as 41 chaves, `null` nas que não são de credencial) e não
 * um `Partial`: um desfecho novo no domínio tem de obrigar a decidir aqui, e um
 * `Partial` deixá-lo-ia cair em silêncio no "não é de credencial" — o operador
 * ficaria sem o link que lhe resolve o problema e nada falharia a avisar.
 * `present.test.ts` repete a verificação em execução.
 *
 * `"route"` = a senha da AT, que se corrige onde a rota **que correu** a guarda
 * (na rota A vive no TOConline); `"toconline"` = do TOConline em qualquer rota.
 */
export const CREDENTIAL_OUTCOME_TARGET: Record<IvaOutcome, "at" | "toconline" | "route" | null> = {
  // --- Sucesso e estados válidos ------------------------------------------
  fetched: null,
  fetched_without_fields: null,
  already_fetched: null,
  no_payment_document: null,
  already_paid: null,
  document_not_ready: null,
  declaration_not_submitted: null,
  declaration_not_found: null,
  // --- Pré-condição --------------------------------------------------------
  payload_invalid: null,
  company_not_found: null,
  company_inactive: null,
  obligation_not_applicable: null,
  company_not_linked: null,
  company_nif_missing: null,
  toconline_credential_missing: "toconline",
  toconline_credential_invalid: "toconline",
  at_credential_missing: "route",
  at_credential_invalid: "route",
  daily_cap_reached: null,
  portal_paused: null,
  // --- Sessão TOConline e Acesso Direto (rota A) ---------------------------
  toconline_login_rejected: "toconline",
  toconline_unavailable: null,
  toconline_unexpected_page: null,
  direct_access_extension_missing: null,
  direct_access_not_configured: "toconline",
  direct_access_failed: null,
  // --- Autenticação na AT --------------------------------------------------
  at_login_rejected: "route",
  at_password_blocked: "route",
  at_password_expired: "route",
  at_2fa_required: "route",
  at_authorization_missing: null,
  at_session_mismatch: null,
  at_unexpected_page: null,
  at_unavailable: null,
  // --- Captura do documento ------------------------------------------------
  document_type_unexpected: null,
  document_capture_failed: null,
  document_fields_mismatch: null,
  // --- Persistência e infraestrutura ---------------------------------------
  persist_failed: null,
  persist_rejected: null,
  interrupted: null,
  unknown_error: null,
};

/**
 * O ecrã que resolve este desfecho, quando existe um.
 *
 * `lastAccess` é a rota por que o job **correu** (`job_access`), não a que o
 * operador vai escolher a seguir: o desfecho foi produzido por ela, e é lá que
 * está a senha que o produziu. Sem rota gravada (jobs anteriores à coluna) os
 * desfechos da senha da AT levam ao ecrã da AT — a rota B era a única.
 */
export function credentialLinkFor(
  outcome: IvaOutcome | null,
  lastAccess: AtAccessMode | null,
): { href: string; label: string } | null {
  if (outcome === null) return null;
  const target = CREDENTIAL_OUTCOME_TARGET[outcome];
  if (target === null) return null;
  const provider =
    target === "route" ? providerForAccess(lastAccess ?? "at_direct_login") : target;
  const { href, label } = ACCESS_TARGET[provider];
  return { href, label };
}
