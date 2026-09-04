import { sql, eq } from "drizzle-orm";
import type { Database } from "@toc/db";
import { schema } from "@toc/db";

export interface ClaimedJob {
  id: string;
  type: string;
  /** `null` nos jobs sem empresa (a varredura é da equipa toda). */
  companyId: string | null;
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
      returning j.id, j.type, j.company_id, j.payload, j.attempts, j.max_attempts, j.trace_id, j.triggering_event_id
    `);

    const row = result.rows[0] as
      | {
          id: string;
          type: string;
          company_id: string | null;
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
      companyId: row.company_id,
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

  /**
   * `details` fica ao lado da razão (não dentro dela) porque é assim que a
   * interface lê o desfecho: `result.reason` é o código, o resto são os dados
   * que a orientação usa (`period`, `attempts`, …).
   */
  async skip(id: string, reason: string, details?: Record<string, unknown>): Promise<void> {
    await this.db
      .update(schema.jobs)
      .set({
        status: "skipped",
        result: { reason, ...details },
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
  async fail(
    id: string,
    // O objeto inteiro vai para `last_error` (jsonb): a view do dashboard lê
    // `last_error.outcome`, e o desfecho perde-se se só a mensagem for gravada.
    error: { message: string; [k: string]: unknown },
    opts: { retry: boolean },
  ): Promise<void> {
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

  /**
   * Devolve o job à fila **sem gastar a tentativa** que o claim consumiu.
   *
   * É o que distingue "adiado" de "falhado": uma pausa do portal (15 min após
   * uma indisponibilidade) não é culpa do job, e se gastasse tentativa três
   * pausas matavam-no sem ele ter chegado a ser tentado. O `deferred: true` em
   * `last_error` é o que o dashboard lê para mostrar "em pausa" em vez de erro.
   */
  async defer(id: string, reason: string, until: Date): Promise<void> {
    await this.db.execute(sql`
      update jobs
      set status = 'pending',
          scheduled_for = ${until},
          attempts = greatest(attempts - 1, 0),
          started_at = null,
          last_error = ${JSON.stringify({ message: reason, deferred: true })}::jsonb,
          updated_at = now()
      where id = ${id}
    `);
  }

  /**
   * Recolhe os jobs que ficaram `running` sem ninguém a trabalhá-los.
   *
   * O worker pode morrer a meio (deploy, OOM, cabo): sem isto o job ficava
   * `running` para sempre — invisível para o claim e, pior, a segurar o índice
   * de idempotência por empresa, que recusa qualquer novo pedido enquanto
   * houver um pendente ou a correr. Devolve quantas linhas recolheu.
   */
  async reapStale(olderThanMs = 15 * 60_000): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMs);
    const interrompido = (retry: boolean) =>
      JSON.stringify({ message: "Execução interrompida.", outcome: "interrupted", retry });

    const result = await this.db.execute(sql`
      update jobs
      set status = case when attempts >= max_attempts then 'failed'::job_status else 'pending'::job_status end,
          scheduled_for = case when attempts >= max_attempts then scheduled_for else now() end,
          /* No que volta à fila limpa-se (não está a correr); no que falha
             guarda-se, que é o rasto de quando a execução perdida começou. */
          started_at = case when attempts >= max_attempts then started_at else null end,
          finished_at = case when attempts >= max_attempts then now() else null end,
          last_error = case when attempts >= max_attempts
            then ${interrompido(false)}::jsonb
            else ${interrompido(true)}::jsonb end,
          updated_at = now()
      where status = 'running'
        and started_at < ${cutoff}
      returning id
    `);

    return result.rows.length;
  }
}
