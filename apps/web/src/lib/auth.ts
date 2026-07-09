import { ROLE_ORDER, type AppRole } from "@toc/core/auth";
import { getSupabaseServerClient } from "./supabase/server";

export type { AppRole };

export interface SessionUser {
  id: string;
  email: string | undefined;
  role: AppRole;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return { id: user.id, email: user.email, role: (profile?.role ?? "viewer") as AppRole };
}

/** Retorna o usuário se tiver ao menos o papel `min`; senão null. */
export async function requireRole(min: AppRole): Promise<SessionUser | null> {
  const user = await getSessionUser();
  if (!user) return null;
  if (ROLE_ORDER.indexOf(user.role) < ROLE_ORDER.indexOf(min)) return null;
  return user;
}
