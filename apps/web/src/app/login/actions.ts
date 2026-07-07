"use server";

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function signIn(formData: FormData) {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });
  if (error) redirect("/login?error=1");
  redirect("/traces");
}

export async function signOut() {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
