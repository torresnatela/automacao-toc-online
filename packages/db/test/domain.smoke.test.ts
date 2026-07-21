import { describe, it, expect, afterAll } from "vitest";
import { createDb } from "../src/index";
import { teams, companies, obligations, obligationPeriods } from "../src/schema/index";
import { eq } from "drizzle-orm";

const db = createDb(
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres",
);

afterAll(async () => {
  await (db.$client as { end: () => Promise<void> }).end();
});

// Ver nota em backbone.smoke.test.ts sobre SKIP_DB_TESTS.
describe.skipIf(process.env.SKIP_DB_TESTS === "1")("domain skeleton", () => {
  it("equipe → empresa → obrigação → período, com unicidade por (obligation, period)", async () => {
    const [team] = await db.insert(teams).values({ name: "Gabinete Teste" }).returning();
    // NISS é UNIQUE global e o insert commita; valor único por execução (Date.now).
    const [c] = await db
      .insert(companies)
      .values({ teamId: team!.id, niss: Date.now(), name: "ACME Lda", type: "employer" })
      .returning();
    const [o] = await db
      .insert(obligations)
      .values({ companyId: c!.id, kind: "iva" })
      .returning();
    const [p] = await db
      .insert(obligationPeriods)
      .values({ obligationId: o!.id, period: "2026-06" })
      .returning();
    expect(p!.status).toBe("pending");

    await expect(
      db.insert(obligationPeriods).values({ obligationId: o!.id, period: "2026-06" }),
    ).rejects.toThrow(); // viola unique (idempotência)

    const found = await db.select().from(obligations).where(eq(obligations.companyId, c!.id));
    expect(found).toHaveLength(1);
  });
});
