import type { ObligationPeriodStatus } from "../types";
import { formatPeriodPt } from "./period";
import { AT_ACCESS_MODES } from "./types";
import type { AtAccessMode, IvaFrequency, IvaOutcomeDetails, IvaStage } from "./types";

/**
 * Mapa de desfechos do Módulo 1 — o que aconteceu, ortogonal ao `jobs.status`.
 *
 * Princípios (spec §5):
 * - `skipped` = sabia-se antes de tentar, ou é estado válido do domínio;
 *   `failed` = tentou-se e não se concluiu.
 * - **Nunca retentar uma senha rejeitada**: cada tentativa gasta uma do contador
 *   da AT e a conta acaba bloqueada por dias.
 * - "Sem documento" não é exceção — é um valor devolvido pela porta.
 * - O estado do período nunca regride de `delivered`/`paid` (é o worker que o
 *   garante; aqui `"error"` significa apenas "marque erro se puder").
 * - A credencial marca-se pelo que o portal disse **sobre ela**, nunca pelo que
 *   disse sobre a empresa.
 *
 * Os rótulos e as orientações vivem aqui, e não no dashboard, porque são
 * conhecimento de domínio (a carta da AT demora ~5 dias úteis, a autorização de
 * acesso a terceiros expira ao ano, nunca se retenta uma senha) reutilizável
 * pelo envio ao cliente que há de vir. O `Record<IvaOutcome, …>` obriga a
 * completar o mapa em compilação: um código novo sem rótulo não compila.
 */
export const IVA_OUTCOME_CODES = [
  // Sucesso e estados válidos
  "fetched",
  "fetched_without_fields",
  "already_fetched",
  "no_payment_document",
  "already_paid",
  "document_not_ready",
  "declaration_not_submitted",
  "declaration_not_found",
  // Pré-condição (antes de abrir o browser)
  "payload_invalid",
  "company_not_found",
  "company_inactive",
  "obligation_not_applicable",
  "company_not_linked",
  "company_nif_missing",
  "toconline_credential_missing",
  "toconline_credential_invalid",
  "at_credential_missing",
  "at_credential_invalid",
  "daily_cap_reached",
  "portal_paused",
  // Sessão TOConline e Acesso Direto (rota A)
  "toconline_login_rejected",
  "toconline_unavailable",
  "toconline_unexpected_page",
  "direct_access_extension_missing",
  "direct_access_not_configured",
  "direct_access_failed",
  // Autenticação na AT (ambas as rotas)
  "at_login_rejected",
  "at_password_blocked",
  "at_password_expired",
  "at_2fa_required",
  "at_authorization_missing",
  "at_session_mismatch",
  "at_unexpected_page",
  "at_unavailable",
  // Captura do documento
  "document_type_unexpected",
  "document_capture_failed",
  "document_fields_mismatch",
  // Persistência e infraestrutura
  "persist_failed",
  "interrupted",
  "unknown_error",
] as const;

export type IvaOutcome = (typeof IVA_OUTCOME_CODES)[number];

/** Nada a fazer · aguardar/retentar · o operador age · suporte técnico. */
export type IvaSeverity = "ok" | "wait" | "action" | "support";

export interface IvaOutcomeSpec {
  /** `deferred` só em `portal_paused`: volta à fila sem gastar tentativa. */
  jobStatus: "succeeded" | "skipped" | "failed" | "deferred";
  /** Só relevante em `failed`; `false` em todos os outros. */
  retry: boolean;
  severity: IvaSeverity;
  /** `null` = não há linha de período; `"keep"` = não lhe tocar. */
  periodStatus: ObligationPeriodStatus | "keep" | null;
  /** O que fazer à credencial usada, à luz do que o portal disse sobre ela. */
  credential: null | "verify" | "invalidate" | "expire";
  /** Só distinguível depois de a Fase 0 revelar a redação do portal. */
  phase0: boolean;
  /** PT-PT curto, para o crachá da lista. */
  label: string;
  /** PT-PT, com marcadores `{period}` `{dueDate}` `{filingDeadline}` `{attemptsLeft}` `{invalidReason}` `{n}`. */
  guidance: string;
}

export const IVA_OUTCOMES: Record<IvaOutcome, IvaOutcomeSpec> = {
  // --- Sucesso e estados válidos ------------------------------------------
  fetched: {
    jobStatus: "succeeded",
    retry: false,
    severity: "ok",
    periodStatus: "delivered",
    credential: "verify",
    phase0: false,
    label: "Guia obtida",
    guidance: "Guia de {period} guardada. Envie-a ao cliente: pagamento até {dueDate}.",
  },
  fetched_without_fields: {
    jobStatus: "succeeded",
    retry: false,
    severity: "ok",
    periodStatus: "delivered",
    credential: "verify",
    phase0: true,
    label: "Guia obtida (sem dados de pagamento)",
    guidance:
      "O PDF de {period} foi guardado, mas não foi possível ler entidade/referência/valor. Confira-os no PDF antes de enviar.",
  },
  already_fetched: {
    jobStatus: "skipped",
    retry: false,
    severity: "ok",
    periodStatus: "keep",
    credential: null,
    phase0: false,
    label: "Já obtida",
    guidance:
      "Nada a fazer: a guia de {period} já estava guardada. Use «Buscar novamente» para forçar.",
  },
  no_payment_document: {
    jobStatus: "skipped",
    retry: false,
    severity: "ok",
    periodStatus: "skipped_nonexistent",
    credential: "verify",
    phase0: true,
    label: "Sem imposto a pagar",
    guidance:
      "Nada a fazer: a declaração de {period} não gera documento de pagamento. Não há guia para enviar.",
  },
  already_paid: {
    jobStatus: "skipped",
    retry: false,
    severity: "ok",
    periodStatus: "paid",
    credential: "verify",
    phase0: true,
    label: "IVA já pago",
    guidance: "Nada a fazer: o portal indica que o IVA de {period} já está pago.",
  },
  document_not_ready: {
    jobStatus: "skipped",
    retry: false,
    severity: "wait",
    periodStatus: "pending",
    credential: null,
    phase0: true,
    label: "Guia ainda não disponível",
    guidance: "A AT ainda não disponibilizou o documento de {period}. Volte a tentar mais tarde.",
  },
  declaration_not_submitted: {
    jobStatus: "skipped",
    retry: false,
    severity: "wait",
    periodStatus: "pending",
    credential: "verify",
    phase0: false,
    label: "Declaração por entregar",
    guidance:
      "A declaração de {period} ainda não consta do portal (entrega até {filingDeadline}). Depois de a entregar, volte a buscar.",
  },
  declaration_not_found: {
    jobStatus: "skipped",
    retry: false,
    severity: "action",
    periodStatus: null,
    credential: "verify",
    phase0: false,
    label: "Sem declarações de IVA",
    guidance:
      "O portal não apresenta declarações periódicas de IVA. Confirme o enquadramento; se isenta, marque a obrigação como não aplicável.",
  },

  // --- Pré-condição --------------------------------------------------------
  payload_invalid: {
    jobStatus: "failed",
    retry: false,
    severity: "support",
    periodStatus: null,
    credential: null,
    phase0: false,
    label: "Pedido inválido",
    guidance: "Volte a pedir a guia; se persistir, contacte o suporte técnico.",
  },
  company_not_found: {
    jobStatus: "failed",
    retry: false,
    severity: "action",
    periodStatus: null,
    credential: null,
    phase0: false,
    label: "Empresa não encontrada",
    guidance: "Atualize a lista de empresas.",
  },
  company_inactive: {
    jobStatus: "skipped",
    retry: false,
    severity: "action",
    periodStatus: null,
    credential: null,
    phase0: false,
    label: "Empresa inativa",
    guidance: "Se retomou atividade, altere o estado na ficha e volte a buscar.",
  },
  obligation_not_applicable: {
    jobStatus: "skipped",
    retry: false,
    severity: "ok",
    periodStatus: "keep",
    credential: null,
    phase0: false,
    label: "IVA não aplicável",
    guidance: "Se o enquadramento mudou, reative a obrigação na ficha da empresa.",
  },
  company_not_linked: {
    jobStatus: "skipped",
    retry: false,
    severity: "action",
    periodStatus: null,
    credential: null,
    phase0: false,
    label: "Sem ligação ao TOConline",
    guidance: "Corra a varredura em Integrações → TOConline e volte a buscar.",
  },
  company_nif_missing: {
    jobStatus: "skipped",
    retry: false,
    severity: "action",
    periodStatus: null,
    credential: null,
    phase0: false,
    label: "Empresa sem NIF",
    guidance: "Preencha o NIF na ficha da empresa.",
  },
  toconline_credential_missing: {
    jobStatus: "skipped",
    retry: false,
    severity: "action",
    periodStatus: null,
    credential: null,
    phase0: false,
    label: "Ligação ao TOConline por configurar",
    guidance: "Configure em Integrações → TOConline.",
  },
  toconline_credential_invalid: {
    jobStatus: "skipped",
    retry: false,
    severity: "action",
    periodStatus: null,
    credential: null,
    phase0: false,
    label: "Senha do TOConline inválida",
    guidance: "Atualize-a em Integrações → TOConline; desbloqueia todas as empresas.",
  },
  at_credential_missing: {
    jobStatus: "skipped",
    retry: false,
    severity: "action",
    periodStatus: null,
    credential: null,
    phase0: false,
    label: "Senha da AT por configurar",
    guidance: "Configure em Integrações → Autoridade Tributária.",
  },
  at_credential_invalid: {
    jobStatus: "skipped",
    retry: false,
    severity: "action",
    periodStatus: null,
    credential: null,
    phase0: false,
    label: "Senha da AT marcada como inválida",
    guidance: "Corrija a causa ({invalidReason}) e volte a guardar a credencial.",
  },
  daily_cap_reached: {
    jobStatus: "skipped",
    retry: false,
    severity: "wait",
    periodStatus: null,
    credential: null,
    phase0: false,
    label: "Limite diário atingido",
    guidance: "Já se tentou {n} vezes hoje. Volte amanhã ou contacte o suporte.",
  },
  portal_paused: {
    jobStatus: "deferred",
    retry: false,
    severity: "wait",
    periodStatus: null,
    credential: null,
    phase0: false,
    label: "Portal em pausa",
    guidance: "O sistema pausou o acesso à AT por indisponibilidade; retoma sozinho.",
  },

  // --- Sessão TOConline e Acesso Direto (rota A) ---------------------------
  toconline_login_rejected: {
    jobStatus: "failed",
    retry: false,
    severity: "action",
    periodStatus: null,
    credential: "invalidate",
    phase0: false,
    label: "Senha do TOConline rejeitada",
    guidance: "Atualize-a em Integrações → TOConline; até lá todas as empresas ficam por obter.",
  },
  toconline_unavailable: {
    jobStatus: "failed",
    retry: true,
    severity: "wait",
    periodStatus: null,
    credential: null,
    phase0: false,
    label: "TOConline não respondeu",
    guidance: "O sistema volta a tentar (até 3×).",
  },
  toconline_unexpected_page: {
    jobStatus: "failed",
    retry: false,
    severity: "support",
    periodStatus: null,
    credential: null,
    phase0: false,
    label: "TOConline com página inesperada",
    guidance: "Consulte o trace e contacte o suporte — o portal pode ter mudado.",
  },
  direct_access_extension_missing: {
    jobStatus: "failed",
    retry: false,
    severity: "support",
    periodStatus: null,
    credential: null,
    phase0: true,
    label: "Extensão TOConline Connect em falta",
    guidance: "Intervenção técnica: sem ela o Acesso Direto não funciona.",
  },
  direct_access_not_configured: {
    jobStatus: "skipped",
    retry: false,
    severity: "action",
    periodStatus: null,
    credential: "invalidate",
    phase0: true,
    label: "Acesso direto por configurar",
    guidance: "Registe a senha da AT em TOConline → Empresa → Senhas da empresa e volte a buscar.",
  },
  direct_access_failed: {
    jobStatus: "failed",
    retry: true,
    severity: "wait",
    periodStatus: null,
    credential: null,
    phase0: true,
    label: "Acesso direto falhou",
    guidance:
      "O sistema volta a tentar; se persistir, teste o Acesso Direto manualmente no TOConline.",
  },

  // --- Autenticação na AT --------------------------------------------------
  at_login_rejected: {
    jobStatus: "failed",
    retry: false,
    severity: "action",
    periodStatus: null,
    credential: "invalidate",
    phase0: false,
    label: "Senha da AT rejeitada",
    guidance:
      "A AT recusou a senha ({attemptsLeft} tentativas antes do bloqueio). Não volte a tentar sem corrigir: verifique nas Senhas da empresa do TOConline (rota A) ou em Integrações → AT (rota B).",
  },
  at_password_blocked: {
    jobStatus: "failed",
    retry: false,
    severity: "action",
    periodStatus: null,
    credential: "invalidate",
    phase0: true,
    label: "Senha da AT bloqueada",
    guidance:
      "Peça nova senha no Portal das Finanças (Recuperar senha): chega por carta em ~5 dias úteis.",
  },
  at_password_expired: {
    jobStatus: "failed",
    retry: false,
    severity: "action",
    periodStatus: null,
    credential: "expire",
    phase0: true,
    label: "Senha da AT expirada",
    guidance:
      "Entre manualmente no portal, defina a nova senha e atualize-a no TOConline / Integrações → AT.",
  },
  at_2fa_required: {
    jobStatus: "failed",
    retry: false,
    severity: "action",
    periodStatus: null,
    credential: "expire",
    phase0: true,
    label: "AT pede código por SMS",
    guidance:
      "O sistema não recebe SMS. Use uma subconta/utilizador sem 2FA (ou faça login assistido: seed-at-session) e volte a buscar.",
  },
  at_authorization_missing: {
    jobStatus: "failed",
    retry: false,
    severity: "action",
    periodStatus: null,
    credential: null,
    phase0: true,
    label: "Sem autorização na AT",
    guidance:
      "Renove a autorização de acesso a terceiros no Portal das Finanças para esta empresa.",
  },
  at_session_mismatch: {
    jobStatus: "failed",
    retry: false,
    severity: "support",
    periodStatus: null,
    credential: null,
    phase0: false,
    label: "Sessão de outro contribuinte",
    guidance: "Nada foi guardado. Verifique o acesso desta empresa e contacte o suporte.",
  },
  at_unexpected_page: {
    jobStatus: "failed",
    retry: false,
    severity: "support",
    periodStatus: null,
    credential: null,
    phase0: false,
    label: "Portal das Finanças com página inesperada",
    guidance: "Consulte o trace e contacte o suporte técnico.",
  },
  at_unavailable: {
    jobStatus: "failed",
    retry: true,
    severity: "wait",
    periodStatus: null,
    credential: null,
    phase0: false,
    label: "Portal das Finanças não respondeu",
    guidance: "O sistema volta a tentar; é frequente entre os dias 20 e 25.",
  },

  // --- Captura do documento ------------------------------------------------
  document_type_unexpected: {
    jobStatus: "failed",
    retry: false,
    severity: "support",
    periodStatus: "error",
    credential: null,
    phase0: true,
    label: "Documento não é a guia da declaração",
    guidance: "Nada foi guardado. Verifique manualmente no portal.",
  },
  document_capture_failed: {
    jobStatus: "failed",
    retry: true,
    severity: "wait",
    periodStatus: "error",
    credential: null,
    phase0: false,
    label: "Falha ao descarregar a guia",
    guidance: "O sistema volta a tentar; se persistir, obtenha manualmente.",
  },
  document_fields_mismatch: {
    jobStatus: "failed",
    retry: false,
    severity: "support",
    periodStatus: "error",
    credential: null,
    phase0: false,
    label: "Guia não corresponde à empresa",
    guidance: "Nada foi guardado. Contacte o suporte técnico.",
  },

  // --- Persistência e infraestrutura ---------------------------------------
  persist_failed: {
    jobStatus: "failed",
    retry: true,
    severity: "wait",
    periodStatus: "error",
    credential: null,
    phase0: false,
    label: "Falha ao guardar",
    guidance: "O sistema volta a tentar automaticamente.",
  },
  interrupted: {
    jobStatus: "failed",
    retry: true,
    severity: "wait",
    periodStatus: "error",
    credential: null,
    phase0: false,
    label: "Execução interrompida",
    guidance: "Volte a pedir a guia.",
  },
  unknown_error: {
    jobStatus: "failed",
    retry: true,
    severity: "wait",
    periodStatus: "error",
    credential: null,
    phase0: false,
    label: "Erro inesperado",
    guidance: "Veja o trace; se persistir, contacte o suporte.",
  },
};

/**
 * Causa de uma credencial marcada `invalid`/`expired`, por extenso.
 *
 * A chave é o que fica em `integration_credentials.metadata`; o valor é o que o
 * operador lê. Nunca contém a senha nem o utilizador.
 */
export const INVALID_REASON_LABELS: Record<string, string> = {
  login_rejeitado: "senha rejeitada pelo portal",
  senha_bloqueada: "senha bloqueada por excesso de tentativas",
  senha_expirada: "senha expirada — o portal exige uma nova",
  "2fa_exigido": "o portal pede código por SMS",
  senha_nao_configurada: "senha da AT por registar no TOConline",
  decrypt_failed: "segredo guardado ilegível",
};

/** Marcador sem valor. Uma orientação nunca sai com `{algo}` por resolver. */
const MISSING = "—";

/** `2026-09-25` → `25/09/2026`; o que não for data ISO devolve-se tal como veio. */
function formatDatePt(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function resolvePlaceholder(name: string, details: IvaOutcomeDetails): string {
  switch (name) {
    case "period":
      return details.period === undefined ? MISSING : formatPeriodPt(details.period);
    case "dueDate":
      return details.dueDate === undefined ? MISSING : formatDatePt(details.dueDate);
    case "filingDeadline":
      return details.filingDeadline === undefined ? MISSING : formatDatePt(details.filingDeadline);
    case "attemptsLeft":
      return details.attemptsLeft === undefined ? MISSING : String(details.attemptsLeft);
    case "invalidReason":
      if (details.invalidReason === undefined) return MISSING;
      return INVALID_REASON_LABELS[details.invalidReason] ?? details.invalidReason;
    default:
      // `{n}` (limite diário) ainda não tem campo em IvaOutcomeDetails: sai como
      // travessão até a fase do worker decidir de onde vem o número.
      return MISSING;
  }
}

/** Orientação do desfecho com os marcadores preenchidos, pronta a mostrar. */
export function renderGuidance(outcome: IvaOutcome, details: IvaOutcomeDetails): string {
  const spec = IVA_OUTCOMES[outcome];
  if (spec === undefined) return "";
  return spec.guidance.replace(/\{(\w+)\}/g, (_full, name: string) =>
    resolvePlaceholder(name, details),
  );
}

/** A linha de `jobs` que a interface tem à mão (nomes das colunas, tal como vêm). */
export interface JobRowForOutcome {
  status: string;
  result: unknown;
  last_error: unknown;
  attempts: number;
  max_attempts: number;
}

export type IvaOutcomeRead =
  | { kind: "in_flight"; attempt: number; lastOutcome?: IvaOutcome }
  | { kind: "outcome"; outcome: IvaOutcome; details: IvaOutcomeDetails };

function fieldOf(source: unknown, key: string): unknown {
  if (typeof source !== "object" || source === null) return undefined;
  return (source as Record<string, unknown>)[key];
}

function toOutcome(value: unknown): IvaOutcome | null {
  if (typeof value !== "string") return null;
  return (IVA_OUTCOME_CODES as readonly string[]).includes(value) ? (value as IvaOutcome) : null;
}

const IVA_STAGES: readonly IvaStage[] = [
  "precondition",
  "toconline",
  "direct_access",
  "at_login",
  "at_declaration",
  "at_document",
  "persist",
];

/** Recolhe do jsonb só os campos que reconhece e com o tipo certo. */
function readDetails(source: unknown): IvaOutcomeDetails {
  const details: IvaOutcomeDetails = {};
  const text = (key: string): string | undefined => {
    const value = fieldOf(source, key);
    return typeof value === "string" && value !== "" ? value : undefined;
  };

  const period = text("period");
  if (period !== undefined) details.period = period;
  const frequency = fieldOf(source, "frequency");
  if (frequency === "monthly" || frequency === "quarterly") {
    details.frequency = frequency satisfies IvaFrequency;
  }
  const dueDate = text("dueDate");
  if (dueDate !== undefined) details.dueDate = dueDate;
  const filingDeadline = text("filingDeadline");
  if (filingDeadline !== undefined) details.filingDeadline = filingDeadline;
  const attemptsLeft = fieldOf(source, "attemptsLeft");
  if (typeof attemptsLeft === "number" && Number.isFinite(attemptsLeft)) {
    details.attemptsLeft = attemptsLeft;
  }
  const stage = text("stage");
  if (stage !== undefined && (IVA_STAGES as readonly string[]).includes(stage)) {
    details.stage = stage as IvaStage;
  }
  const invalidReason = text("invalidReason");
  if (invalidReason !== undefined) details.invalidReason = invalidReason;
  const obligationPeriodId = text("obligationPeriodId");
  if (obligationPeriodId !== undefined) details.obligationPeriodId = obligationPeriodId;
  const documentId = text("documentId");
  if (documentId !== undefined) details.documentId = documentId;
  const access = text("access");
  if (access !== undefined && (AT_ACCESS_MODES as readonly string[]).includes(access)) {
    details.access = access as AtAccessMode;
  }
  return details;
}

/**
 * O único sítio que conhece as três formas em que um desfecho fica gravado.
 *
 * `succeeded` põe-no em `result.outcome`, `skipped` em `result.reason` e
 * `failed` em `last_error.outcome` — três formas porque três caminhos de
 * escrita diferentes as produzem. Uma linha antiga, sem código reconhecível,
 * lê-se como `unknown_error` em vez de rebentar a lista. **Nunca lança.**
 */
export function readIvaOutcome(job: JobRowForOutcome): IvaOutcomeRead {
  const attempts =
    typeof job?.attempts === "number" && Number.isFinite(job.attempts) ? job.attempts : 0;

  if (job?.status === "pending" || job?.status === "running") {
    // A fila incrementa `attempts` ao reclamar o job: em `running` é a tentativa
    // a decorrer, em `pending` é a que está para começar.
    const attempt = job.status === "running" ? Math.max(1, attempts) : attempts + 1;
    const lastOutcome = toOutcome(fieldOf(job.last_error, "outcome"));
    return lastOutcome === null
      ? { kind: "in_flight", attempt }
      : { kind: "in_flight", attempt, lastOutcome };
  }

  const source = job?.status === "failed" ? job.last_error : job?.result;
  const key = job?.status === "skipped" ? "reason" : "outcome";
  return {
    kind: "outcome",
    outcome: toOutcome(fieldOf(source, key)) ?? "unknown_error",
    details: readDetails(source),
  };
}
