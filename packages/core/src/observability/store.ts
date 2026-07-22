import { eq } from "drizzle-orm";
import type { SupabaseClient } from "@supabase/supabase-js";
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

/**
 * Store que persiste via um SupabaseClient com service role (bypassa RLS).
 * Usado pelo app web, que já tem um client admin, evitando abrir uma conexão
 * `pg` direta na Vercel. O client é injetado — não há acoplamento em runtime.
 *
 * O Supabase JS usa os nomes reais das colunas (snake_case), diferente do Drizzle.
 */
export class SupabaseStore implements ObservabilityStore {
  constructor(private readonly client: SupabaseClient) {}

  newId(): string {
    return crypto.randomUUID();
  }
  async saveTrace(t: TraceRecord) {
    const { error } = await this.client.from("traces").insert({
      id: t.id,
      root_trigger: t.rootTrigger,
      trigger_source: t.triggerSource ?? null,
      correlation_key: t.correlationKey ?? null,
      status: t.status,
      created_by: t.createdBy ?? null,
      started_at: t.startedAt.toISOString(),
    });
    if (error) throw error;
  }
  async updateTrace(id: string, patch: Partial<TraceRecord>) {
    const { error } = await this.client
      .from("traces")
      .update({ status: patch.status, ended_at: patch.endedAt?.toISOString() ?? null })
      .eq("id", id);
    if (error) throw error;
  }
  async saveEvent(e: EventRecord) {
    const { error } = await this.client.from("events").insert({
      id: e.id,
      trace_id: e.traceId,
      parent_event_id: e.parentEventId ?? null,
      type: e.type,
      source: e.source,
      status: e.status,
      payload: e.payload,
      occurred_at: e.occurredAt.toISOString(),
    });
    if (error) throw error;
  }
  async updateEvent(id: string, patch: Partial<EventRecord>) {
    const { error } = await this.client
      .from("events")
      .update({
        status: patch.status,
        error: patch.error ?? null,
        duration_ms: patch.durationMs ?? null,
      })
      .eq("id", id);
    if (error) throw error;
  }
  async saveLog(l: LogRecord) {
    const { error } = await this.client.from("logs").insert({
      id: l.id,
      trace_id: l.traceId,
      event_id: l.eventId ?? null,
      level: l.level,
      message: l.message,
      data: l.data,
      logged_at: l.loggedAt.toISOString(),
    });
    if (error) throw error;
  }
}
