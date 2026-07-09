"use server";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { validateNewPassword } from "@toc/core/auth";

export async function changePassword(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (validateNewPassword(password, confirm)) {
    redirect("/change-password?error=validacao");
  }

  const supabase = await getSupabaseServerClient();
  const { error: pwError } = await supabase.auth.updateUser({ password });
  if (pwError) redirect("/change-password?error=salvar");

  // Limpa a trava em ambas as fontes (via service role): app_metadata (gate do
  // middleware/login) e a coluna profiles (exibição no admin). Se algo falhar,
  // o gate continua ativo e o usuário é levado de volta — sem trava silenciosa.
  const admin = getSupabaseAdminClient();
  const { error: metaError } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { must_change_password: false },
  });
  const { error: colError } = await admin
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", user.id);
  if (metaError || colError) redirect("/change-password?error=salvar");

  redirect("/");
}
