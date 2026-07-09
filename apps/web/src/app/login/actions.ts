"use server";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { logUserEvent } from "@/lib/observability/tracer";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email"));
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: String(formData.get("password")),
  });
  if (error) {
    // Evento de usuário: tentativa de login falha (sem senha nos dados).
    await logUserEvent({ action: "login", data: { email }, status: "failed", error: { message: error.message } });
    redirect("/login?error=1");
  }

  await logUserEvent({ action: "login", userId: data.user.id, data: { email } });

  // Gate do 1º acesso no app_metadata do JWT (sem query ao banco). Decidir aqui
  // evita o "pulo" pelo middleware durante a navegação RSC, que não atualiza a
  // URL do browser.
  const mustChange = data.user.app_metadata?.must_change_password === true;
  redirect(mustChange ? "/change-password" : "/");
}

export async function signOut() {
  // Captura o usuário antes de encerrar a sessão para atribuir o evento.
  const user = await getSessionUser();
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();

  await logUserEvent({
    action: "logout",
    userId: user?.id,
    data: user?.email ? { email: user.email } : {},
  });

  redirect("/login");
}
