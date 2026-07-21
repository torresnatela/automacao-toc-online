import type { TeamInput, TeamRecord } from "../types";
import { validateTeamInput, type TeamFieldErrors } from "./validate";

/** Porta de persistência da equipe. Implementação real na app web; testes usam fakes. */
export interface TeamRepo {
  insert(record: TeamRecord): Promise<{ id: string }>;
  // `found: false` quando nenhuma linha casou o id (equipe inexistente).
  update(id: string, record: TeamRecord): Promise<{ found: boolean }>;
}

export type TeamServiceOutput =
  | { ok: true; id: string }
  | { ok: false; fieldErrors?: TeamFieldErrors; error?: string };

function nn(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return v === "" ? null : v;
}

export function normalizeTeam(input: TeamInput): TeamRecord {
  return {
    name: input.name.trim(),
    nif: nn(input.nif),
    status: input.status ?? "active",
  };
}

export async function createTeam(repo: TeamRepo, input: TeamInput): Promise<TeamServiceOutput> {
  const fieldErrors = validateTeamInput(input);
  if (fieldErrors) return { ok: false, fieldErrors };

  const { id } = await repo.insert(normalizeTeam(input));
  return { ok: true, id };
}

export async function updateTeam(
  repo: TeamRepo,
  id: string,
  input: TeamInput,
): Promise<TeamServiceOutput> {
  const fieldErrors = validateTeamInput(input);
  if (fieldErrors) return { ok: false, fieldErrors };

  const { found } = await repo.update(id, normalizeTeam(input));
  if (!found) return { ok: false, error: "Equipe não encontrada." };
  return { ok: true, id };
}
