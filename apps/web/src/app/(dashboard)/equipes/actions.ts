"use server";

import { revalidatePath } from "next/cache";
import {
  createTeamFromInput,
  updateTeamFromInput,
  deleteTeam,
  teamInputFrom,
} from "@/lib/teams/service";
import type { TeamFieldErrors } from "@toc/core/domain";

export interface TeamFormState {
  ok?: boolean;
  error?: string;
  fieldErrors?: TeamFieldErrors;
}

export async function createTeamAction(
  _prev: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const result = await createTeamFromInput(teamInputFrom(Object.fromEntries(formData)));
  if (!result.ok) return { error: result.error, fieldErrors: result.fieldErrors };
  revalidatePath("/equipes");
  return { ok: true };
}

export async function updateTeamAction(
  id: string,
  _prev: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const result = await updateTeamFromInput(id, teamInputFrom(Object.fromEntries(formData)));
  if (!result.ok) return { error: result.error, fieldErrors: result.fieldErrors };
  revalidatePath("/equipes");
  revalidatePath(`/equipes/${id}`);
  return { ok: true };
}

export async function deleteTeamAction(id: string): Promise<void> {
  await deleteTeam(id);
  revalidatePath("/equipes");
}
