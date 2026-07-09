import "server-only";
import { createClient } from "@supabase/supabase-js";

// Cliente Supabase com a service-role key. Bypassa RLS e habilita a Admin API
// (auth.admin.createUser). USO EXCLUSIVO no servidor: importe apenas de módulos
// "use server". A chave NÃO tem prefixo NEXT_PUBLIC_ (não vai ao bundle do
// cliente) e o import "server-only" quebra o build se vazar para um Client
// Component.
export function getSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
