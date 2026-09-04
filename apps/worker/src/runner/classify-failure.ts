import type { IvaOutcome, IvaOutcomeDetails, IvaStage } from "@toc/core/domain";
import {
  AtAuthError,
  AtIntegrityError,
  AtTransientError,
  InvalidCredentialsError,
  StructuralError,
} from "../errors";

/**
 * Traduz a exceção que subiu do adaptador no desfecho que o operador lê.
 *
 * Pura e num ficheiro só seu porque é aqui que vive **a regra única**:
 * `retry = !(err instanceof StructuralError)`, sem exceções. O runner não
 * decide retentar — pergunta. Assim a decisão fica testável contra a tabela de
 * `IVA_OUTCOMES` (classe × etapa) em vez de espalhada por `catch`es.
 *
 * A etapa não muda a decisão de retry: só escolhe o código quando o erro não
 * traz um (um timeout na AT é `at_unavailable`, o mesmo timeout no TOConline é
 * `toconline_unavailable`) e fica sempre em `details.stage` para diagnóstico.
 */
export interface ClassifiedFailure {
  outcome: IvaOutcome;
  retry: boolean;
  details: IvaOutcomeDetails;
}

/** `AtAuthError.reason` → código do desfecho. */
function outcomeDoLogin(err: AtAuthError): IvaOutcome {
  switch (err.reason) {
    case "rejected":
      return "at_login_rejected";
    case "blocked":
      return "at_password_blocked";
    case "expired":
      return "at_password_expired";
    case "two_factor":
      return "at_2fa_required";
    case "authorization_missing":
      return "at_authorization_missing";
  }
}

/**
 * Erro estrutural sem código próprio: o portal daquela etapa mostrou algo que
 * não sabemos ler. Pede olhos humanos, nunca outra tentativa.
 */
function estruturalPorEtapa(stage: IvaStage): IvaOutcome {
  switch (stage) {
    case "toconline":
    case "direct_access":
      return "toconline_unexpected_page";
    case "at_login":
    case "at_declaration":
    case "at_document":
      return "at_unexpected_page";
    case "precondition":
      return "payload_invalid";
    case "persist":
      // Não `persist_failed`: esse código é retentável e este erro não é (um
      // bucket inexistente ou um 4xx do Storage não passa a existir à terceira).
      // `unknown_error` diz o que é — inesperado — e a regra única corta o retry.
      return "unknown_error";
  }
}

/**
 * Erro transitório sem código próprio (inclui o `TimeoutError` do Playwright):
 * o portal da etapa não respondeu a tempo. Vale a pena tentar outra vez.
 */
function transitorioPorEtapa(stage: IvaStage): IvaOutcome {
  switch (stage) {
    case "toconline":
    case "direct_access":
      return "toconline_unavailable";
    case "at_login":
    case "at_declaration":
    case "at_document":
      return "at_unavailable";
    case "persist":
      return "persist_failed";
    case "precondition":
      // Antes do browser não há portal a culpar: se rebentou aqui, é nosso.
      return "unknown_error";
  }
}

function outcomeDe(err: unknown, stage: IvaStage): IvaOutcome {
  if (err instanceof AtAuthError) return outcomeDoLogin(err);
  if (err instanceof AtIntegrityError) return err.outcome;
  if (err instanceof AtTransientError) return err.outcome;
  if (err instanceof InvalidCredentialsError) return "toconline_login_rejected";
  if (err instanceof StructuralError) return estruturalPorEtapa(stage);
  if (err instanceof Error) return transitorioPorEtapa(stage);
  // Alguém lançou uma string (ou um objeto): sem forma de saber o que foi.
  return "unknown_error";
}

export function classifyFailure(err: unknown, stage: IvaStage): ClassifiedFailure {
  const details: IvaOutcomeDetails = { stage };
  if (err instanceof AtAuthError && err.attemptsLeft !== undefined) {
    details.attemptsLeft = err.attemptsLeft;
  }

  return {
    outcome: outcomeDe(err, stage),
    // A regra única. Não há `if` por etapa nem por código que a contorne.
    retry: !(err instanceof StructuralError),
    details,
  };
}
