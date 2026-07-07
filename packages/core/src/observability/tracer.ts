import type { ObservabilityStore } from "./store";
import { Logger } from "./logger";
import type { EventInput, ErrorInput, StartTraceInput } from "./types";

async function createEvent(
  store: ObservabilityStore,
  traceId: string,
  input: EventInput,
  parentEventId?: string,
): Promise<EventHandle> {
  const id = store.newId();
  await store.saveEvent({
    id,
    traceId,
    parentEventId,
    type: input.type,
    source: input.source,
    status: "in_progress",
    payload: input.payload ?? {},
    occurredAt: new Date(),
  });
  return new EventHandle(store, id, traceId);
}

/** Um nó da árvore causal. Emite filhos, muda de estado e carrega um Logger. */
export class EventHandle {
  readonly log: Logger;
  constructor(
    private readonly store: ObservabilityStore,
    readonly id: string,
    readonly traceId: string,
  ) {
    this.log = new Logger(store, traceId, id);
  }

  child(input: EventInput): Promise<EventHandle> {
    return createEvent(this.store, this.traceId, input, this.id);
  }
  async succeed(opts?: { durationMs?: number }) {
    await this.store.updateEvent(this.id, {
      status: "succeeded",
      durationMs: opts?.durationMs ?? null,
    });
  }
  async fail(error: ErrorInput) {
    await this.store.updateEvent(this.id, { status: "failed", error });
  }
  async skip(reason: string) {
    await this.store.updateEvent(this.id, { status: "skipped", error: { reason } });
  }
}

/** Contexto-raiz de um gatilho. Todos os eventos decorrentes ficam ligados a ele. */
export class TraceHandle {
  readonly log: Logger;
  constructor(
    private readonly store: ObservabilityStore,
    readonly id: string,
  ) {
    this.log = new Logger(store, id);
  }

  event(input: EventInput): Promise<EventHandle> {
    return createEvent(this.store, this.id, input);
  }
  async complete() {
    await this.store.updateTrace(this.id, { status: "completed", endedAt: new Date() });
  }
  async fail(_error: ErrorInput) {
    await this.store.updateTrace(this.id, { status: "failed", endedAt: new Date() });
  }
}

export interface Tracer {
  startTrace(input: StartTraceInput): Promise<TraceHandle>;
}

export function createTracer(store: ObservabilityStore): Tracer {
  return {
    async startTrace(input) {
      const id = store.newId();
      await store.saveTrace({
        id,
        rootTrigger: input.rootTrigger,
        triggerSource: input.triggerSource,
        correlationKey: input.correlationKey,
        createdBy: input.createdBy,
        status: "open",
        startedAt: new Date(),
      });
      return new TraceHandle(store, id);
    },
  };
}
