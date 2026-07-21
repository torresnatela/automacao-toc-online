"use server";

import { requireRole } from "@/lib/auth";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { registerUser, type UiRole } from "@toc/core/auth";

export interface CreateUserState {
  ok?: boolean;
  email?: string;
  tempPassword?: string;
  warning?: string;
  error?: string;
}

// Cadastra um usuário (apenas admin). Gera senha temporária e a devolve para ser
// exibida uma vez na tela. O papel é atribuído via service role (bypass RLS). O
// gate de troca no 1º acesso vai no app_metadata do JWT (lido pelo middleware
// sem query extra); o trigger handle_new_user também marca a coluna profiles.
export async function createUser(
  _prev: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  const admin = await requireRole("admin");
  if (!admin) return { error: "Acesso restrito a administradores." };

  const email = String(formData.get("email") ?? "");
  const fullName = String(formData.get("full_name") ?? "");
  const uiRole = String(formData.get("role") ?? "member") as UiRole;
  const teamId = String(formData.get("team_id") ?? "");

  const supabaseAdmin = getSupabaseAdminClient();
  let newUserId: string | undefined;

  const result = await registerUser(
    {
      async createAuthUser(input) {
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
          email: input.email,
          password: input.password,
          email_confirm: true,
          user_metadata: { full_name: input.fullName },
          app_metadata: { must_change_password: true },
        });
        if (error) return { error: error.message };
        newUserId = data.user.id;
        return { userId: data.user.id };
      },
      async assignRole(input) {
        const { error } = await supabaseAdmin
          .from("profiles")
          .update({ role: input.role, full_name: input.fullName })
          .eq("id", input.userId);
        return error ? { error: error.message } : {};
      },
    },
    { email, fullName, uiRole },
  );

  if (!result.ok) return { error: result.error };

  // Atribui a equipe (opcional). A service role tem auth.uid() NULL, então o
  // guard prevent_privileged_self_update não bloqueia a mudança de team_id.
  let warning = result.warning;
  if (teamId && newUserId) {
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ team_id: teamId })
      .eq("id", newUserId);
    if (error) {
      warning = `${warning ? warning + "; " : ""}falha ao atribuir equipe: ${error.message}`;
    }
  }

  return {
    ok: true,
    email: result.email,
    tempPassword: result.tempPassword,
    warning,
  };
}
