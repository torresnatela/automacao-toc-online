import { TEAM_STATUSES, type TeamInput, type TeamStatus } from "../types";

export type TeamField = "name" | "nif" | "status";
export type TeamFieldErrors = Partial<Record<TeamField, string>>;

const NIF_RE = /^\d{9}$/;

/**
 * Valida a entrada de uma equipe (gabinete). Retorna um mapa campo→mensagem (pt)
 * ou `null` se estiver ok. Pura — testável no CI.
 */
export function validateTeamInput(input: TeamInput): TeamFieldErrors | null {
  const errors: TeamFieldErrors = {};

  if (!input.name?.trim()) errors.name = "Nome é obrigatório.";

  const nif = (input.nif ?? "").trim();
  if (nif && !NIF_RE.test(nif)) errors.nif = "NIF deve ter 9 dígitos.";

  if (input.status && !TEAM_STATUSES.includes(input.status as TeamStatus)) {
    errors.status = "Status inválido.";
  }

  return Object.keys(errors).length > 0 ? errors : null;
}
