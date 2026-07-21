import { TEAM_STATUSES, type TeamInput, type TeamStatus } from "../types";
import { isValidNif } from "../validate-pt";

export type TeamField = "name" | "nif" | "status";
export type TeamFieldErrors = Partial<Record<TeamField, string>>;

/**
 * Valida a entrada de uma equipe (gabinete). Retorna um mapa campo→mensagem (pt)
 * ou `null` se estiver ok. Pura — testável no CI.
 */
export function validateTeamInput(input: TeamInput): TeamFieldErrors | null {
  const errors: TeamFieldErrors = {};

  if (!input.name?.trim()) errors.name = "Nome é obrigatório.";

  const nif = (input.nif ?? "").trim();
  if (nif && !isValidNif(nif)) errors.nif = "NIF inválido (9 dígitos + dígito de controlo).";

  if (input.status && !TEAM_STATUSES.includes(input.status as TeamStatus)) {
    errors.status = "Status inválido.";
  }

  return Object.keys(errors).length > 0 ? errors : null;
}
