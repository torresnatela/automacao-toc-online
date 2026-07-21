import type { TeamInput, TeamRecord } from "../types";
import { validateTeamInput, type TeamFieldErrors } from "./validate";

/** Porta de persistência da equipe. Implementação real na app web; testes usam fakes. */
export interface TeamRepo {
  insert(record: TeamRecord): Promise<{ id: string }>;
  update(id: string, record: TeamRecord): Promise<void>;
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

  await repo.update(id, normalizeTeam(input));
  return { ok: true, id };
}
