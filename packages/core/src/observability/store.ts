import { eq } from "drizzle-orm";
import type { Database } from "@toc/db";
import { schema } from "@toc/db";
import type { EventRecord, LogRecord, TraceRecord } from "./types";

/**
 * Abstração de persistência da observabilidade. Permite testar o Tracer/Logger
 * sem banco (InMemoryStore) e persistir de verdade em produção (DbStore).
 */
export interface ObservabilityStore {
  saveTrace(t: TraceRecord): Promise<void>;
  updateTrace(id: string, patch: Partial<TraceRecord>): Promise<void>;
  saveEvent(e: EventRecord): Promise<void>;
  updateEvent(id: string, patch: Partial<EventRecord>): Promise<void>;
  saveLog(l: LogRecord): Promise<void>;
  newId(): string;
}

export class InMemoryStore implements ObservabilityStore {
  readonly traces = new Map<string, TraceRecord>();
  readonly events = new Map<string, EventRecord>();
  readonly logs = new Map<string, LogRecord>();
  private seq = 0;

  newId(): string {
    return `id-${++this.seq}`;
  }
  async saveTrace(t: TraceRecord) {
    this.traces.set(t.id, { ...t });
  }
  async updateTrace(id: string, patch: Partial<TraceRecord>) {
    const cur = this.traces.get(id);
    if (cur) this.traces.set(id, { ...cur, ...patch });
  }
  async saveEvent(e: EventRecord) {
    this.events.set(e.id, { ...e });
  }
  async updateEvent(id: string, patch: Partial<EventRecord>) {
    const cur = this.events.get(id);
    if (cur) this.events.set(id, { ...cur, ...patch });
  }
  async saveLog(l: LogRecord) {
    this.logs.set(l.id, { ...l });
  }
}

export class DbStore implements ObservabilityStore {
  constructor(private readonly db: Database) {}

  newId(): string {
    return crypto.randomUUID();
  }
  async saveTrace(t: TraceRecord) {
    await this.db.insert(schema.traces).values({
      id: t.id,
      rootTrigger: t.rootTrigger,
      triggerSource: t.triggerSource ?? null,
      correlationKey: t.correlationKey ?? null,
      status: t.status,
      createdBy: t.createdBy ?? null,
      startedAt: t.startedAt,
    });
  }
  async updateTrace(id: string, patch: Partial<TraceRecord>) {
    await this.db
      .update(schema.traces)
      .set({ status: patch.status, endedAt: patch.endedAt ?? null })
      .where(eq(schema.traces.id, id));
  }
  async saveEvent(e: EventRecord) {
    await this.db.insert(schema.events).values({
      id: e.id,
      traceId: e.traceId,
      parentEventId: e.parentEventId ?? null,
      type: e.type,
      source: e.source,
      status: e.status,
      payload: e.payload,
      occurredAt: e.occurredAt,
    });
  }
  async updateEvent(id: string, patch: Partial<EventRecord>) {
    await this.db
      .update(schema.events)
      .set({
        status: patch.status,
        error: patch.error ?? null,
        durationMs: patch.durationMs ?? null,
      })
      .where(eq(schema.events.id, id));
  }
  async saveLog(l: LogRecord) {
    await this.db.insert(schema.logs).values({
      id: l.id,
      traceId: l.traceId,
      eventId: l.eventId ?? null,
      level: l.level,
      message: l.message,
      data: l.data,
      loggedAt: l.loggedAt,
    });
  }
}
