import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { createDb, schema } from "@toc/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { JobQueue } from "../../src/runner/job-queue";

const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const db = createDb(url);
const queue = new JobQueue(db);

// Tipo exclusivo deste ficheiro (não o literal de produção): outros ficheiros de
// teste (ex.: cli/extract.test.ts) tocam a mesma tabela `jobs` partilhada com o
// Supabase local, e o Vitest corre ficheiros em paralelo por omissão. Um `type`
// só deste ficheiro evita que o cleanup de um ficheiro apague jobs do outro.
const JOB_TYPE = `test.job-queue.${randomUUID()}`;

beforeEach(async () => {
  await db.delete(schema.jobs).where(eq(schema.jobs.type, JOB_TYPE));
});

afterAll(async () => {
  await db.delete(schema.jobs).where(eq(schema.jobs.type, JOB_TYPE));
  await (db.$client as { end: () => Promise<void> }).end();
});

async function enqueue(
  payload: unknown,
  extra: { traceId?: string; triggeringEventId?: string } = {},
) {
  const [row] = await db
    .insert(schema.jobs)
    .values({ type: JOB_TYPE, payload: payload as object, ...extra })
    .returning();
  return row;
}

// Exige o Supabase local. No CI, SKIP_DB_TESTS=1 pula — mesmo padrão dos
// smoke tests em packages/db/test/*.smoke.test.ts.
describe.skipIf(process.env.SKIP_DB_TESTS === "1")("JobQueue", () => {
  it("devolve null quando não há jobs pendentes", async () => {
    expect(await queue.claimNext(JOB_TYPE)).toBeNull();
  });

  it("reclama um job pendente e marca-o como running", async () => {
    await enqueue({ kind: "iva" });
    const claimed = await queue.claimNext(JOB_TYPE);
    expect(claimed).not.toBeNull();
    expect(claimed!.payload).toMatchObject({ kind: "iva" });

    const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, claimed!.id));
    expect(row!.status).toBe("running");
    expect(row!.attempts).toBe(1);
    expect(row!.startedAt).not.toBeNull();
  });

  // jobs.trace_id / jobs.triggering_event_id carregam a cadeia causal do CLI
  // (que abre o trace) até ao worker (que a continua) através da fila.
  it("devolve traceId e triggeringEventId quando o job os traz", async () => {
    const traceId = randomUUID();
    const triggeringEventId = randomUUID();
    await enqueue({ kind: "iva" }, { traceId, triggeringEventId });

    const claimed = await queue.claimNext(JOB_TYPE);

    expect(claimed!.traceId).toBe(traceId);
    expect(claimed!.triggeringEventId).toBe(triggeringEventId);
  });

  it("devolve traceId e triggeringEventId nulos quando o job não os traz", async () => {
    await enqueue({ kind: "iva" });

    const claimed = await queue.claimNext(JOB_TYPE);

    expect(claimed!.traceId).toBeNull();
    expect(claimed!.triggeringEventId).toBeNull();
  });

  it("não reclama duas vezes o mesmo job", async () => {
    await enqueue({ kind: "iva" });
    const first = await queue.claimNext(JOB_TYPE);
    const second = await queue.claimNext(JOB_TYPE);
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  // Prova de atomicidade: dois claims disparados em paralelo (Promise.all, não
  // sequenciais) contra duas linhas pendentes. Um SELECT+UPDATE ingénuo poderia
  // deixar os dois claimers lerem a mesma linha antes de qualquer UPDATE
  // confirmar; `FOR UPDATE SKIP LOCKED` garante que cada um fica com uma linha
  // distinta e nenhum bloqueia à espera do outro.
  it("dois claims concorrentes reclamam linhas distintas sem bloquear um no outro", async () => {
    await enqueue({ kind: "iva" });
    await enqueue({ kind: "irs" });

    const [a, b] = await Promise.all([queue.claimNext(JOB_TYPE), queue.claimNext(JOB_TYPE)]);

    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.id).not.toBe(b!.id);

    const rows = await db.select().from(schema.jobs).where(eq(schema.jobs.type, JOB_TYPE));
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.status).toBe("running");
      expect(row.attempts).toBe(1);
    }
  });

  it("ignora jobs agendados para o futuro", async () => {
    const future = new Date(Date.now() + 60_000);
    await db.insert(schema.jobs).values({ type: JOB_TYPE, payload: {}, scheduledFor: future });
    expect(await queue.claimNext(JOB_TYPE)).toBeNull();
  });

  it("complete grava o resultado e finaliza", async () => {
    await enqueue({});
    const claimed = await queue.claimNext(JOB_TYPE);
    await queue.complete(claimed!.id, { documentId: "abc" });

    const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, claimed!.id));
    expect(row!.status).toBe("succeeded");
    expect(row!.result).toMatchObject({ documentId: "abc" });
    expect(row!.finishedAt).not.toBeNull();
  });

  it("skip marca como skipped com a razão", async () => {
    await enqueue({});
    const claimed = await queue.claimNext(JOB_TYPE);
    await queue.skip(claimed!.id, "already_extracted");

    const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, claimed!.id));
    expect(row!.status).toBe("skipped");
    expect(row!.result).toMatchObject({ reason: "already_extracted" });
  });

  it("fail com retry devolve o job a pending com backoff", async () => {
    await enqueue({});
    const claimed = await queue.claimNext(JOB_TYPE);
    await queue.fail(claimed!.id, { message: "timeout" }, { retry: true });

    const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, claimed!.id));
    expect(row!.status).toBe("pending");
    expect(row!.scheduledFor.getTime()).toBeGreaterThan(Date.now());
  });

  it("fail sem retry marca failed definitivamente", async () => {
    await enqueue({});
    const claimed = await queue.claimNext(JOB_TYPE);
    await queue.fail(claimed!.id, { message: "seletor não encontrado" }, { retry: false });

    const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, claimed!.id));
    expect(row!.status).toBe("failed");
    expect(row!.lastError).toMatchObject({ message: "seletor não encontrado" });
  });

  it("fail com retry esgota as tentativas e passa a failed", async () => {
    const job = await enqueue({});
    for (let i = 0; i < 3; i++) {
      await db
        .update(schema.jobs)
        .set({ scheduledFor: new Date(Date.now() - 1000) })
        .where(eq(schema.jobs.id, job!.id));
      const claimed = await queue.claimNext(JOB_TYPE);
      expect(claimed).not.toBeNull();
      await queue.fail(claimed!.id, { message: "timeout" }, { retry: true });
    }
    const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, job!.id));
    expect(row!.status).toBe("failed");
    expect(row!.attempts).toBe(3);
  });
});
