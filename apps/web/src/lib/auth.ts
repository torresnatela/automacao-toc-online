import { ROLE_ORDER, resolveTeamScope, type AppRole } from "@toc/core/auth";
import { getSupabaseServerClient } from "./supabase/server";

export type { AppRole };

export interface SessionUser {
  id: string;
  email: string | undefined;
  role: AppRole;
  teamId: string | null; // equipe (tenant); null = admin global
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, team_id")
    .eq("id", user.id)
    .single();

  return {
    id: user.id,
    email: user.email,
    role: (profile?.role ?? "viewer") as AppRole,
    teamId: (profile?.team_id ?? null) as string | null,
  };
}

/** Retorna o usuário se tiver ao menos o papel `min`; senão null. */
export async function requireRole(min: AppRole): Promise<SessionUser | null> {
  const user = await getSessionUser();
  if (!user) return null;
  if (ROLE_ORDER.indexOf(user.role) < ROLE_ORDER.indexOf(min)) return null;
  return user;
}

/** Quem escreve, e sobre que equipe. */
export type WriterScope =
  | { ok: true; actor: SessionUser; teamId: string }
  | { ok: false; status: number; error: string };

/**
 * Sessão + equipa numa passagem, para qualquer serviço que escreva.
 *
 * A equipa é sempre explícita, nunca inferida da RLS: para um operador a RLS já
 * reduz a uma, mas um **admin** é global e tem de dizer sobre qual está a agir.
 * A **decisão** (papel suficiente? que equipa?) está em `@toc/core/auth`,
 * testada sem Next nem Supabase; aqui fica só a leitura da sessão.
 */
export async function requireWriterOn(
  requestedTeamId: string,
  minimumRole: AppRole = "operator",
): Promise<WriterScope> {
  const actor = await getSessionUser();
  const scope = resolveTeamScope(actor, requestedTeamId, minimumRole);
  if (!scope.ok) return scope;
  // Inalcançável — sem sessão o `scope` acima já teria devolvido 401. Está aqui
  // para estreitar o tipo sem um `as`.
  if (!actor) return { ok: false, status: 401, error: "Não autenticado." };
  return { ok: true, actor, teamId: scope.teamId };
}
