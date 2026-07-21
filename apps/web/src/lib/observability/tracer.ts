import "server-only";
import {
  createTracer,
  recordUserEvent,
  SupabaseStore,
  type Tracer,
  type UserEventInput,
} from "@toc/core/observability";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Tracer do app web. Persiste traces/events/logs via service role (bypassa RLS),
 * reusando o client admin — evita abrir uma conexão `pg` direta na Vercel.
 * Uso exclusivo no servidor ("use server" / Server Components).
 */
export function getWebTracer(): Tracer {
  return createTracer(new SupabaseStore(getSupabaseAdminClient()));
}

/**
 * Registra um evento de usuário **sem nunca quebrar o fluxo chamador** (fail-open):
 * uma falha de observabilidade não pode impedir login/logout.
 */
export async function logUserEvent(input: UserEventInput): Promise<void> {
  try {
    await recordUserEvent(getWebTracer(), input);
  } catch (err) {
    console.error("[observability] falha ao registrar evento de usuário", err);
  }
}
