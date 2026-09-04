import { IVA_OUTCOMES, type IvaDocumentJobPayload, type IvaOutcome, type IvaOutcomeDetails } from "@toc/core/domain";
import type { AtCredentialSource } from "./ports";

/**
 * O que um desfecho **faz**: que estado deixa no job e que marca deixa na
 * credencial.
 *
 * Vive fora do runner porque são as duas únicas decisões dele que não dependem
 * da ordem dos passos — respondem só ao código do desfecho. Juntas no
 * orquestrador, ficavam a competir pela atenção com as dezasseis etapas; aqui
 * lêem-se contra a tabela `IVA_OUTCOMES`, que é de onde ambas saem.
 */

/**
 * Causa a registar na credencial, por desfecho.
 *
 * A chave é o desfecho, o valor é o que `INVALID_REASON_LABELS` sabe traduzir
 * ao operador. Só entram aqui os desfechos que o portal disse **sobre a
 * credencial** — é esta lista que decide se `markByOutcome` tem alguma coisa a
 * registar.
 */
const RAZAO_POR_DESFECHO: Partial<Record<IvaOutcome, string>> = {
  at_login_rejected: "login_rejeitado",
  at_password_blocked: "senha_bloqueada",
  at_password_expired: "senha_expirada",
  at_2fa_required: "2fa_exigido",
  direct_access_not_configured: "senha_nao_configurada",
  toconline_login_rejected: "login_rejeitado",
};

/**
 * O que `desfechoDoJob` devolve de facto: nunca `succeeded` (tem caminho
 * próprio, com o resultado completo) nem `deferred` (precisa do `untilMs` que
 * só a trava sabe). Um tipo à parte — e não `JobOutcome` inteiro — é o que
 * deixa o `catch` do runner estreitar `desfecho` para o ramo `failed` depois
 * de despachar o `skipped`, sem `retry` sobrar num desfecho que não o leva.
 */
export type DesfechoDoJob =
  | { status: "skipped"; reason: IvaOutcome; details: Record<string, unknown> }
  | {
      status: "failed";
      message: string;
      retry: boolean;
      code: IvaOutcome;
      details: Record<string, unknown>;
    };

/**
 * Traduz um desfecho no `JobOutcome` que a fila grava.
 *
 * A tradução vem de `IVA_OUTCOMES[outcome].jobStatus`, e não de um `if` por
 * caso, porque é essa tabela que o dashboard lê pelo avesso: `readIvaOutcome`
 * procura o código em `result.reason` quando o job é `skipped` e em
 * `last_error.outcome` quando é `failed`. Escrever o estado à mão abriria a
 * porta a um `failed` gravado num desfecho que a tabela diz ser `skipped` — o
 * dashboard procurava o código no sítio errado e mostrava "erro inesperado" a
 * quem só precisava de configurar uma senha.
 */
export function desfechoDoJob(
  outcome: IvaOutcome,
  details: IvaOutcomeDetails,
  message: string,
): DesfechoDoJob {
  const spec = IVA_OUTCOMES[outcome];
  if (spec.jobStatus === "skipped") {
    return { status: "skipped", reason: outcome, details: { ...details } };
  }
  // `succeeded` tem caminho próprio (leva o resultado completo) e `deferred`
  // precisa do `untilMs` que só a trava sabe: nenhum dos dois passa por aqui.
  return { status: "failed", message, retry: spec.retry, code: outcome, details: { ...details } };
}

/**
 * Marca a credencial pelo que o portal disse **sobre ela**, nunca pelo que
 * disse sobre a empresa.
 *
 * Na rota A a senha da AT vive no TOConline, não em `integration_credentials`:
 * quando a AT a recusa, o que se marca é uma linha-marcador da empresa. A
 * credencial do TOConline está boa, e tocar-lhe bloquearia as 182 empresas por
 * causa de uma. A exceção é o próprio TOConline recusar o login — aí foi mesmo
 * a nossa credencial que ele viu.
 *
 * Fail-open: marcar a credencial é consequência do desfecho, não pode ser
 * quem o derruba.
 */
export async function markByOutcome(
  credentials: AtCredentialSource,
  outcome: IvaOutcome,
  details: IvaOutcomeDetails,
  payload: IvaDocumentJobPayload,
): Promise<void> {
  const spec = IVA_OUTCOMES[outcome];
  if (spec.credential !== "invalidate" && spec.credential !== "expire") return;
  const reason = RAZAO_POR_DESFECHO[outcome];
  if (reason === undefined) return;

  try {
    if (outcome === "toconline_login_rejected") {
      await credentials.markInvalid(payload.credentialId, reason);
      return;
    }
    if (payload.access === "at_direct_login") {
      await (spec.credential === "expire"
        ? credentials.markExpired(payload.credentialId, reason)
        : credentials.markInvalid(payload.credentialId, reason));
      return;
    }
    await credentials.markCompanyAtInvalid({
      teamId: payload.teamId,
      companyId: payload.companyId,
      reason,
      ...(details.attemptsLeft === undefined ? {} : { attemptsLeft: details.attemptsLeft }),
    });
  } catch {
    // deliberadamente silencioso
  }
}
