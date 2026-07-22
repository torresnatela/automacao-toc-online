import { describe, expect, it } from "vitest";
import { SupabaseStore } from "../src/observability/store";
import type { EventRecord, LogRecord, TraceRecord } from "../src/observability/types";

interface RecordedCall {
  table: string;
  op: "insert" | "update";
  values: Record<string, unknown>;
  eq?: [string, unknown];
}

/**
 * Fake mínimo do SupabaseClient: registra cada insert/update para inspeção.
 * Reproduz o encadeamento real `.from(t).insert(v)` e `.from(t).update(v).eq(c, v)`,
 * ambos "thenable" resolvendo em `{ error }`.
 */
function fakeClient(error: unknown = null) {
  const calls: RecordedCall[] = [];
  const client = {
    from(table: string) {
      return {
        insert(values: Record<string, unknown>) {
          calls.push({ table, op: "insert", values });
          return Promise.resolve({ error });
        },
        update(values: Record<string, unknown>) {
          return {
            eq(column: string, value: unknown) {
              calls.push({ table, op: "update", values, eq: [column, value] });
              return Promise.resolve({ error });
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

function makeStore(error: unknown = null) {
  const { client, calls } = fakeClient(error);
  const store = new SupabaseStore(client as unknown as ConstructorParameters<typeof SupabaseStore>[0]);
  return { store, calls };
}

const startedAt = new Date("2026-07-08T10:00:00.000Z");
const occurredAt = new Date("2026-07-08T10:00:01.000Z");
const loggedAt = new Date("2026-07-08T10:00:02.000Z");

describe("SupabaseStore", () => {
  it("grava um trace mapeando para colunas snake_case", async () => {
    const { store, calls } = makeStore();
    const trace: TraceRecord = {
      id: "t1",
      rootTrigger: "manual",
      triggerSource: "web",
      correlationKey: "client:abc:period:2026-07",
      status: "open",
      createdBy: "user-1",
      startedAt,
    };

    await store.saveTrace(trace);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ table: "traces", op: "insert" });
    expect(calls[0]?.values).toEqual({
      id: "t1",
      root_trigger: "manual",
      trigger_source: "web",
      correlation_key: "client:abc:period:2026-07",
      status: "open",
      created_by: "user-1",
      started_at: startedAt.toISOString(),
    });
  });

  it("aplica updateTrace com status/ended_at e filtro por id", async () => {
    const { store, calls } = makeStore();
    const endedAt = new Date("2026-07-08T10:05:00.000Z");

    await store.updateTrace("t1", { status: "completed", endedAt });

    expect(calls[0]).toMatchObject({
      table: "traces",
      op: "update",
      values: { status: "completed", ended_at: endedAt.toISOString() },
      eq: ["id", "t1"],
    });
  });

  it("grava um event mapeando trace_id/parent_event_id/occurred_at", async () => {
    const { store, calls } = makeStore();
    const event: EventRecord = {
      id: "e1",
      traceId: "t1",
      parentEventId: "e0",
      type: "user.login",
      source: "web",
      status: "in_progress",
      payload: { email: "a@b.pt" },
      occurredAt,
    };

    await store.saveEvent(event);

    expect(calls[0]?.values).toEqual({
      id: "e1",
      trace_id: "t1",
      parent_event_id: "e0",
      type: "user.login",
      source: "web",
      status: "in_progress",
      payload: { email: "a@b.pt" },
      occurred_at: occurredAt.toISOString(),
    });
  });

  it("aplica updateEvent com status/error/duration_ms", async () => {
    const { store, calls } = makeStore();

    await store.updateEvent("e1", { status: "failed", error: { message: "boom" }, durationMs: 42 });

    expect(calls[0]).toMatchObject({
      table: "events",
      op: "update",
      values: { status: "failed", error: { message: "boom" }, duration_ms: 42 },
      eq: ["id", "e1"],
    });
  });

  it("grava um log mapeando trace_id/event_id/logged_at", async () => {
    const { store, calls } = makeStore();
    const log: LogRecord = {
      id: "l1",
      traceId: "t1",
      eventId: "e1",
      level: "info",
      message: "ok",
      data: { size: 3 },
      loggedAt,
    };

    await store.saveLog(log);

    expect(calls[0]?.values).toEqual({
      id: "l1",
      trace_id: "t1",
      event_id: "e1",
      level: "info",
      message: "ok",
      data: { size: 3 },
      logged_at: loggedAt.toISOString(),
    });
  });

  it("lança quando o Supabase retorna erro (para a instrumentação fail-open capturar)", async () => {
    const { store } = makeStore({ message: "insert failed" });

    await expect(
      store.saveTrace({
        id: "t1",
        rootTrigger: "manual",
        status: "open",
        startedAt,
      }),
    ).rejects.toEqual({ message: "insert failed" });
  });

  it("gera ids uuid distintos", () => {
    const { store } = makeStore();
    const a = store.newId();
    const b = store.newId();
    expect(a).not.toEqual(b);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
  });
});
