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

  // Decide o destino já aqui: um redirect de Server Action para /traces que o
  // middleware precisasse re-redirecionar (navegação RSC) não atualiza a URL do
  // browser. Ir direto para /change-password quando a troca é obrigatória.
  const { data: profile } = await supabase
    .from("profiles")
    .select("must_change_password")
    .eq("id", data.user.id)
    .single();
  redirect(profile?.must_change_password ? "/change-password" : "/traces");
}

export async function signOut() {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
