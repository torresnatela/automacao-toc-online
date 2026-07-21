import "server-only";
import { createDb } from "@toc/db";
import { createTracer, DbStore, type Tracer } from "@toc/core";

// Tracer memoizado em nível de módulo: reaproveita um único Pool `pg` (via createDb)
// entre requisições, em vez de abrir uma conexão por ação. Só use em runtime Node
// (route handlers / server actions) — NUNCA no middleware edge.
let tracer: Tracer | null = null;

function getTracer(): Tracer {
  if (!tracer) {
    tracer = createTracer(new DbStore(createDb(process.env.DATABASE_URL!)));
  }
  return tracer;
}

export interface ActionMeta {
  triggerSource: string; // ex.: "companies.create"
  type: string; // ex.: "company.create"
  createdBy: string; // id do usuário
  payload?: Record<string, unknown>;
}

/**
 * Abre um trace `manual` + um event para uma ação com efeito colateral (regra do
 * CLAUDE.md). Retorna `success()`/`failure(msg)` para fechar o trace conforme o
 * desfecho. Uso: `const act = await startAction(meta); try { ...; await act.success() }`.
 */
export async function startAction(meta: ActionMeta) {
  const trace = await getTracer().startTrace({
    rootTrigger: "manual",
    triggerSource: meta.triggerSource,
    createdBy: meta.createdBy,
  });
  const evt = await trace.event({ type: meta.type, source: "web", payload: meta.payload ?? {} });
  return {
    async success() {
      await evt.succeed();
      await trace.complete();
    },
    async failure(message: string) {
      await evt.fail({ message });
      await trace.fail({ message });
    },
  };
}
