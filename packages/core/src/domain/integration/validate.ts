import { INTEGRATION_PROVIDERS, type CredentialInput, type IntegrationProvider } from "./types";

export type CredentialField = "teamId" | "provider" | "username" | "password";
export type CredentialFieldErrors = Partial<Record<CredentialField, string>>;

/** Limite defensivo: nada aqui é uma regra de negócio, só sanidade de coluna. */
const MAX_USERNAME = 255;
const MAX_PASSWORD = 200;

export interface ValidateCredentialOptions {
  /** `true` num create, ou num update de uma linha que ainda não tem segredo. */
  requirePassword?: boolean;
}

/**
 * Valida a entrada de uma credencial. Devolve mapa campo→mensagem (pt) ou
 * `null`. Pura — e as mensagens **nunca ecoam o valor** de nada.
 *
 * Note-se a ausência de regra de força para a senha: é a senha de um terceiro
 * num portal de terceiro, não uma senha nossa. Impor um mínimo rejeitaria
 * credenciais legítimas por uma regra que o TOConline não tem.
 */
export function validateCredentialInput(
  input: CredentialInput,
  options: ValidateCredentialOptions = {},
): CredentialFieldErrors | null {
  const errors: CredentialFieldErrors = {};

  if (!input.teamId?.trim()) errors.teamId = "Equipe é obrigatória.";

  if (!INTEGRATION_PROVIDERS.includes(input.provider as IntegrationProvider)) {
    errors.provider = "Integração inválida.";
  }

  const username = (input.username ?? "").trim();
  if (!username) errors.username = "Utilizador é obrigatório.";
  else if (username.length > MAX_USERNAME) errors.username = "Utilizador demasiado longo.";

  const password = input.password ?? "";
  if (options.requirePassword && !password) {
    errors.password = "Palavra-passe é obrigatória.";
  } else if (password.length > MAX_PASSWORD) {
    errors.password = "Palavra-passe demasiado longa.";
  }

  return Object.keys(errors).length > 0 ? errors : null;
}
