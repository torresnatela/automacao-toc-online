"use server";

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function signIn(formData: FormData) {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });
  if (error) redirect("/login?error=1");

  // Gate do 1º acesso no app_metadata do JWT (sem query ao banco). Decidir aqui
  // evita o "pulo" pelo middleware durante a navegação RSC, que não atualiza a
  // URL do browser.
  const mustChange = data.user.app_metadata?.must_change_password === true;
  redirect(mustChange ? "/change-password" : "/traces");
}

export async function signOut() {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
