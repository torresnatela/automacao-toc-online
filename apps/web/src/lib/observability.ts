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
  /** Chave de negócio para correlacionar traces distintos (ex.: `team:<id>:toconline`). */
  correlationKey?: string;
}

export interface StartedAction {
  /** Correlation ID da cadeia inteira. Gravar em `jobs.trace_id` ao enfileirar. */
  traceId: string;
  /** Evento gatilho. Gravar em `jobs.triggering_event_id` — o worker pendura o seu nele. */
  eventId: string;
  success(): Promise<void>;
  failure(message: string): Promise<void>;
  /**
   * Fecha o evento com sucesso mas **deixa o trace aberto**, para trabalho que
   * continua noutro processo. Um job enfileirado e nunca consumido deve
   * aparecer como trace por fechar — é esse o sinal correto. Quem fecha é quem
   * termina o trabalho (o worker).
   */
  handOff(): Promise<void>;
}

/**
 * Abre um trace `manual` + um event para uma ação com efeito colateral (regra do
 * CLAUDE.md). Retorna `success()`/`failure(msg)` para fechar o trace conforme o
 * desfecho. Uso: `const act = await startAction(meta); try { ...; await act.success() }`.
 */
export async function startAction(meta: ActionMeta): Promise<StartedAction> {
  const trace = await getTracer().startTrace({
    rootTrigger: "manual",
    triggerSource: meta.triggerSource,
    createdBy: meta.createdBy,
    correlationKey: meta.correlationKey,
  });
  const evt = await trace.event({ type: meta.type, source: "web", payload: meta.payload ?? {} });
  return {
    traceId: trace.id,
    eventId: evt.id,
    async success() {
      await evt.succeed();
      await trace.complete();
    },
    async failure(message: string) {
      await evt.fail({ message });
      await trace.fail({ message });
    },
    async handOff() {
      await evt.succeed();
    },
  };
}
