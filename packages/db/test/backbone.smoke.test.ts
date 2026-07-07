import { describe, it, expect, afterAll } from "vitest";
import { createDb } from "../src/index";
import { traces, events, logs } from "../src/schema/index";
import { eq } from "drizzle-orm";

const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const db = createDb(url);

afterAll(async () => {
  await (db.$client as { end: () => Promise<void> }).end();
});

// Testes de integração exigem o Supabase local (RLS depende de auth.users/auth.uid()).
// No CI, SKIP_DB_TESTS=1 os pula; localmente rodam por padrão (após `pnpm db:start`).
describe.skipIf(process.env.SKIP_DB_TESTS === "1")("backbone schema", () => {
  it("insere um trace, um event filho e um log ligados", async () => {
    const [trace] = await db
      .insert(traces)
      .values({ rootTrigger: "manual", triggerSource: "test" })
      .returning();
    const [evt] = await db
      .insert(events)
      .values({ traceId: trace!.id, type: "test.event", source: "test", occurredAt: new Date() })
      .returning();
    const [log] = await db
      .insert(logs)
      .values({
        traceId: trace!.id,
        eventId: evt!.id,
        level: "info",
        message: "ok",
        loggedAt: new Date(),
      })
      .returning();

    expect(evt!.traceId).toBe(trace!.id);
    expect(log!.eventId).toBe(evt!.id);

    const found = await db.select().from(events).where(eq(events.traceId, trace!.id));
    expect(found).toHaveLength(1);
  });
});
