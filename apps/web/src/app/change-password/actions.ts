"use server";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function changePassword(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 6 || password !== confirm) {
    redirect("/change-password?error=1");
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect("/change-password?error=1");

  // Limpa a flag via service role: o self-update de must_change_password é
  // bloqueado pelo trigger prevent_privileged_self_update.
  const admin = getSupabaseAdminClient();
  await admin
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", user.id);

  redirect("/traces");
}
