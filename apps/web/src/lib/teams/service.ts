import "server-only";
import { getSessionUser, type SessionUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { startAction } from "@/lib/observability";
import {
  createTeam,
  updateTeam,
  type TeamRepo,
  type TeamInput,
  type TeamRecord,
  type TeamFieldErrors,
} from "@toc/core/domain";

export interface TeamRow {
  id: string;
  name: string;
  nif: string | null;
  status: string;
}

const COLUMNS = "id, name, nif, status";

export type TeamMutationResult =
  | { ok: true; id: string }
  | { ok: false; status: number; error: string; fieldErrors?: TeamFieldErrors };

export function teamInputFrom(src: Record<string, unknown>): TeamInput {
  const str = (v: unknown) => (v == null || v === "" ? null : String(v));
  return {
    name: String(src.name ?? ""),
    nif: str(src.nif),
    status: (src.status as TeamInput["status"]) || undefined,
  };
}

// --- Leitura (RLS: usuário vê a própria equipe; admin vê todas) ---

export async function listTeams(): Promise<TeamRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.from("teams").select(COLUMNS).order("name", { ascending: true });
  return (data ?? []) as TeamRow[];
}

export async function getTeam(id: string): Promise<TeamRow | null> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.from("teams").select(COLUMNS).eq("id", id).maybeSingle();
  return (data ?? null) as TeamRow | null;
}

// --- Escrita (apenas admin; service role bypassa RLS) ---

type Admin = ReturnType<typeof getSupabaseAdminClient>;

function toRow(r: TeamRecord) {
  return { name: r.name, nif: r.nif, status: r.status };
}

function teamRepo(admin: Admin): TeamRepo {
  return {
    async insert(record) {
      const { data, error } = await admin.from("teams").insert(toRow(record)).select("id").single();
      if (error) throw new Error(error.message);
      return { id: (data as { id: string }).id };
    },
    async update(id, record) {
      const { error } = await admin
        .from("teams")
        .update({ ...toRow(record), updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
  };
}

async function requireAdmin(): Promise<
  { ok: true; actor: SessionUser } | { ok: false; status: number; error: string }
> {
  const user = await getSessionUser();
  if (!user) return { ok: false, status: 401, error: "Não autenticado." };
  if (user.role !== "admin") {
    return { ok: false, status: 403, error: "Acesso restrito a administradores." };
  }
  return { ok: true, actor: user };
}

export async function createTeamFromInput(input: TeamInput): Promise<TeamMutationResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const { actor } = auth;

  const admin = getSupabaseAdminClient();
  const act = await startAction({
    triggerSource: "teams.create",
    type: "team.create",
    createdBy: actor.id,
    payload: { name: input.name },
  });
  try {
    const result = await createTeam(teamRepo(admin), input);
    if (!result.ok) {
      await act.failure("validação");
      return {
        ok: false,
        status: 400,
        error: "Não foi possível cadastrar a equipe.",
        fieldErrors: result.fieldErrors,
      };
    }
    await act.success();
    return { ok: true, id: result.id };
  } catch (e) {
    const message = e instanceof Error ? e.message : "erro desconhecido";
    await act.failure(message);
    return { ok: false, status: 500, error: message };
  }
}

export async function updateTeamFromInput(
  id: string,
  input: TeamInput,
): Promise<TeamMutationResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const { actor } = auth;

  const admin = getSupabaseAdminClient();
  const { data: existing } = await admin.from("teams").select("id").eq("id", id).maybeSingle();
  if (!existing) return { ok: false, status: 404, error: "Equipe não encontrada." };

  const act = await startAction({
    triggerSource: "teams.update",
    type: "team.update",
    createdBy: actor.id,
    payload: { id },
  });
  try {
    const result = await updateTeam(teamRepo(admin), id, input);
    if (!result.ok) {
      await act.failure("validação");
      return {
        ok: false,
        status: 400,
        error: "Não foi possível atualizar a equipe.",
        fieldErrors: result.fieldErrors,
      };
    }
    await act.success();
    return { ok: true, id: result.id };
  } catch (e) {
    const message = e instanceof Error ? e.message : "erro desconhecido";
    await act.failure(message);
    return { ok: false, status: 500, error: message };
  }
}

export async function deleteTeam(id: string): Promise<TeamMutationResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const { actor } = auth;

  const admin = getSupabaseAdminClient();
  const { data: existing } = await admin.from("teams").select("id").eq("id", id).maybeSingle();
  if (!existing) return { ok: false, status: 404, error: "Equipe não encontrada." };

  const act = await startAction({
    triggerSource: "teams.delete",
    type: "team.delete",
    createdBy: actor.id,
    payload: { id },
  });
  try {
    const { error } = await admin.from("teams").delete().eq("id", id);
    if (error) throw new Error(error.message);
    await act.success();
    return { ok: true, id };
  } catch (e) {
    const message = e instanceof Error ? e.message : "erro desconhecido";
    await act.failure(message);
    return { ok: false, status: 500, error: message };
  }
}
