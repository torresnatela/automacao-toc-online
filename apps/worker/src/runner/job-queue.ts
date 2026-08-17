import { sql, eq } from "drizzle-orm";
import type { Database } from "@toc/db";
import { schema } from "@toc/db";

export interface ClaimedJob {
  id: string;
  type: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
  traceId: string | null;
  triggeringEventId: string | null;
}

/** Backoff exponencial: 1min, 4min, 9min. */
function backoffMs(attempts: number): number {
  return attempts * attempts * 60_000;
}

/**
 * Fila de jobs sobre a tabela `jobs`.
 *
 * O claim usa `FOR UPDATE SKIP LOCKED` dentro de um CTE: dois workers a correr
 * em paralelo nunca reclamam a mesma linha, e nenhum bloqueia à espera do outro.
 */
export class JobQueue {
  constructor(private readonly db: Database) {}

  async claimNext(type: string): Promise<ClaimedJob | null> {
    const result = await this.db.execute(sql`
      with next_job as (
        select id from jobs
        where status = 'pending'
          and type = ${type}
          and scheduled_for <= now()
        order by scheduled_for
        for update skip locked
        limit 1
      )
      update jobs j
      set status = 'running',
          attempts = j.attempts + 1,
          started_at = now(),
          updated_at = now()
      from next_job
      where j.id = next_job.id
      returning j.id, j.type, j.payload, j.attempts, j.max_attempts, j.trace_id, j.triggering_event_id
    `);

    const row = result.rows[0] as
      | {
          id: string;
          type: string;
          payload: unknown;
          attempts: number;
          max_attempts: number;
          trace_id: string | null;
          triggering_event_id: string | null;
        }
      | undefined;
    if (!row) return null;

    return {
      id: row.id,
      type: row.type,
      payload: row.payload,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      traceId: row.trace_id,
      triggeringEventId: row.triggering_event_id,
    };
  }

  async complete(id: string, result: unknown): Promise<void> {
    await this.db
      .update(schema.jobs)
      .set({
        status: "succeeded",
        result: result as object,
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.jobs.id, id));
  }

  async skip(id: string, reason: string): Promise<void> {
    await this.db
      .update(schema.jobs)
      .set({
        status: "skipped",
        result: { reason },
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.jobs.id, id));
  }

  /**
   * `retry: false` para erros estruturais (seletor partido, credencial inválida):
   * repetir só multiplica o tráfego contra o portal do Estado sem hipótese de sucesso.
   * `retry: true` só para falhas transitórias (rede, timeout, 5xx).
   */
  async fail(id: string, error: { message: string }, opts: { retry: boolean }): Promise<void> {
    const [job] = await this.db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
    if (!job) {
      throw new Error(`Job ${id} não encontrado`);
    }

    const exhausted = job.attempts >= job.maxAttempts;
    const willRetry = opts.retry && !exhausted;

    await this.db
      .update(schema.jobs)
      .set({
        status: willRetry ? "pending" : "failed",
        lastError: error,
        scheduledFor: willRetry ? new Date(Date.now() + backoffMs(job.attempts)) : job.scheduledFor,
        finishedAt: willRetry ? null : new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.jobs.id, id));
  }
}
