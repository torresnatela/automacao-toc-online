import { describe, it, expect, afterAll } from "vitest";
import { createDb } from "../src/index";
import { clients, obligations, obligationPeriods } from "../src/schema/index";
import { eq } from "drizzle-orm";

const db = createDb(
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres",
);

afterAll(async () => {
  await (db.$client as { end: () => Promise<void> }).end();
});

// Ver nota em backbone.smoke.test.ts sobre SKIP_DB_TESTS.
describe.skipIf(process.env.SKIP_DB_TESTS === "1")("domain skeleton", () => {
  it("cliente → obrigação → período, com unicidade por (obligation, period)", async () => {
    const [c] = await db.insert(clients).values({ name: "ACME Lda", nif: "500000000" }).returning();
    const [o] = await db.insert(obligations).values({ clientId: c!.id, kind: "iva" }).returning();
    const [p] = await db
      .insert(obligationPeriods)
      .values({ obligationId: o!.id, period: "2026-06" })
      .returning();
    expect(p!.status).toBe("pending");

    await expect(
      db.insert(obligationPeriods).values({ obligationId: o!.id, period: "2026-06" }),
    ).rejects.toThrow(); // viola unique (idempotência)

    const found = await db.select().from(obligations).where(eq(obligations.clientId, c!.id));
    expect(found).toHaveLength(1);
  });
});
