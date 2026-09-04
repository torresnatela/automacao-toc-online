import type { CredentialStatus, IntegrationProvider } from "../integration/types";
import type { AtAccessMode } from "./types";

/**
 * Escolha da credencial que abre a sessão, por modo de acesso.
 *
 * Duas rotas, dois donos da senha:
 * - **A (`toconline_direct_access`)** — quem entra na AT é o TOConline, com a
 *   senha que o gabinete lá registou. De nós só sai a credencial TOConline da
 *   equipa; a senha da AT nunca passa por aqui.
 * - **B (`at_direct_login`)** — entramos na AT com uma credencial nossa: a da
 *   empresa se existir, senão a da equipa.
 *
 * O **marcador** é a peça menos óbvia: uma linha `at` da empresa **sem
 * segredo**, criada só para registar o que o portal disse sobre aquela senha
 * (bloqueada, expirada, 2FA…). Ele bloqueia as **duas** rotas, porque em ambas
 * é a mesma senha da AT que vai ser usada — na rota A ela está do lado do
 * TOConline, mas continua a ser a mesma conta a gastar tentativas.
 */
export interface CredentialCandidate {
  id: string;
  provider: IntegrationProvider;
  /** `null` = credencial da equipa. */
  companyId: string | null;
  status: CredentialStatus;
  /** Há segredo cifrado guardado (um marcador não tem). */
  hasSecret: boolean;
  /** Chave de `INVALID_REASON_LABELS`, quando o estado não é `active`. */
  invalidReason?: string;
}

export type AccessCredentialSelection =
  | { ok: true; credentialId: string; scope: "team" | "company" }
  | {
      ok: false;
      outcome:
        | "toconline_credential_missing"
        | "toconline_credential_invalid"
        | "at_credential_missing"
        | "at_credential_invalid";
      invalidReason?: string;
    };

function rejected(
  outcome: Extract<AccessCredentialSelection, { ok: false }>["outcome"],
  invalidReason?: string,
): AccessCredentialSelection {
  return invalidReason === undefined
    ? { ok: false, outcome }
    : { ok: false, outcome, invalidReason };
}

/**
 * Decide entre `missing` e `invalid` para o candidato já escolhido.
 *
 * Um candidato `active` mas sem segredo é uma linha que ficou para trás, não
 * uma credencial: para quem vai entrar no portal, é como se não existisse.
 */
function evaluate(
  candidate: CredentialCandidate | undefined,
  missing: Extract<AccessCredentialSelection, { ok: false }>["outcome"],
  invalid: Extract<AccessCredentialSelection, { ok: false }>["outcome"],
): AccessCredentialSelection {
  if (candidate === undefined) return rejected(missing);
  if (candidate.status !== "active") return rejected(invalid, candidate.invalidReason);
  if (!candidate.hasSecret) return rejected(missing);
  return {
    ok: true,
    credentialId: candidate.id,
    scope: candidate.companyId === null ? "team" : "company",
  };
}

export function selectAccessCredential(
  access: AtAccessMode,
  companyId: string,
  candidates: readonly CredentialCandidate[],
): AccessCredentialSelection {
  const rows = candidates ?? [];

  // Guarda transversal: a senha da AT desta empresa já foi recusada/bloqueada.
  const blocked = rows.find(
    (c) => c.provider === "at" && c.companyId === companyId && c.status !== "active",
  );
  if (blocked !== undefined) {
    return rejected("at_credential_invalid", blocked.invalidReason);
  }

  if (access === "toconline_direct_access") {
    const team = rows.find((c) => c.provider === "toconline" && c.companyId === null);
    return evaluate(team, "toconline_credential_missing", "toconline_credential_invalid");
  }

  const company = rows.find((c) => c.provider === "at" && c.companyId === companyId);
  const team = rows.find((c) => c.provider === "at" && c.companyId === null);
  return evaluate(company ?? team, "at_credential_missing", "at_credential_invalid");
}
