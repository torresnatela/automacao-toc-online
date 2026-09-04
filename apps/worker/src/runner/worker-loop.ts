import { sleep as sleepPadrao } from "../support/sleep";
import type { ClaimedJob, JobQueue } from "./job-queue";

/**
 * Consome a fila: reclama um job de cada tipo registado, despacha-o para o
 * handler e traduz o desfecho em transição de estado.
 *
 * `tick()` é público e faz exatamente uma passagem, sem temporizadores — é o
 * que torna o loop testável sem relógios falsos nem esperas. `start()` é só
 * `tick()` em repetição até ao sinal de paragem.
 */

/** De quantos ticks em quantos se recolhem os jobs órfãos (≈5 min a 5 s/tick). */
export const REAP_EVERY_TICKS = 60;

export type JobOutcome =
  | { status: "succeeded"; result: unknown }
  | { status: "skipped"; reason: string; details?: Record<string, unknown> }
  | {
      status: "failed";
      message: string;
      retry: boolean;
      /** Vai para `last_error.outcome` — é o campo que a view do dashboard lê. */
      code?: string;
      details?: Record<string, unknown>;
    }
  /** Nem sucesso nem falha: volta à fila em `untilMs` sem gastar tentativa. */
  | { status: "deferred"; reason: string; untilMs: number };

export interface JobHandler {
  run(job: ClaimedJob): Promise<JobOutcome>;
  /**
   * Ritmo mínimo entre jobs deste tipo. Vive no handler e não no loop porque
   * quem sabe que está a automatizar o portal do Estado é ele: 182 empresas a
   * 5 s são 30 minutos de propósito, não uma lentidão a corrigir.
   */
  pacingMs?: number;
}

export interface WorkerLoopDeps {
  queue: JobQueue;
  /** Chave = `jobs.type`. */
  handlers: Record<string, JobHandler>;
  pollIntervalMs?: number;
  /** Pausa entre jobs: automatizamos o portal de um terceiro, sem pressa. */
  betweenJobsMs?: number;
  /** Injetável para os testes não esperarem de verdade. */
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string, data?: Record<string, unknown>) => void;
}

export class WorkerLoop {
  /**
   * Ritmo exigido pelos handlers que trabalharam no último `tick()`.
   *
   * Fica aqui, e não no valor de retorno de `tick()`, para não mudar o contrato
   * que os testes do ciclo usam — `tick()` continua a responder só "idle" ou
   * "worked". Zero quando o ciclo não trabalhou.
   */
  private pacingDoCiclo = 0;

  constructor(private readonly deps: WorkerLoopDeps) {}

  /** Uma passagem por todos os tipos registados. */
  async tick(): Promise<"idle" | "worked"> {
    let worked = false;
    this.pacingDoCiclo = 0;

    for (const [type, handler] of Object.entries(this.deps.handlers)) {
      const job = await this.deps.queue.claimNext(type);
      if (!job) continue;
      worked = true;
      this.pacingDoCiclo = Math.max(this.pacingDoCiclo, handler.pacingMs ?? 0);

      this.deps.log?.("job reclamado", { jobId: job.id, type, attempt: job.attempts });

      let outcome: JobOutcome;
      try {
        outcome = await handler.run(job);
      } catch (err) {
        // Um handler bem comportado não deixa escapar exceções; se escapar,
        // trata-se como transitório para não perder o job em silêncio.
        outcome = {
          status: "failed",
          message: err instanceof Error ? err.message : "erro desconhecido",
          retry: true,
        };
      }

      await this.aplicar(job, outcome);

      this.deps.log?.("job terminado", { jobId: job.id, status: outcome.status });
    }

    return worked ? "worked" : "idle";
  }

  /** Traduz o desfecho na escrita correspondente da fila. */
  private async aplicar(job: ClaimedJob, outcome: JobOutcome): Promise<void> {
    switch (outcome.status) {
      case "succeeded":
        await this.deps.queue.complete(job.id, outcome.result);
        return;
      case "skipped":
        await this.deps.queue.skip(job.id, outcome.reason, outcome.details);
        return;
      case "deferred":
        await this.deps.queue.defer(job.id, outcome.reason, new Date(outcome.untilMs));
        return;
      case "failed":
        await this.deps.queue.fail(
          job.id,
          {
            message: outcome.message,
            ...(outcome.code ? { outcome: outcome.code } : {}),
            ...outcome.details,
          },
          { retry: outcome.retry },
        );
        return;
    }
  }

  /**
   * Recolhe os jobs que um worker morto deixou em `running`.
   *
   * Fail-open: a fila estar em baixo no arranque não pode impedir o worker de
   * arrancar — na pior das hipóteses os órfãos esperam pelo ciclo seguinte.
   */
  private async recolherOrfaos(): Promise<void> {
    try {
      const recolhidos = await this.deps.queue.reapStale();
      if (recolhidos > 0) this.deps.log?.("jobs órfãos recolhidos", { recolhidos });
    } catch (err) {
      this.deps.log?.("falha ao recolher órfãos", {
        message: err instanceof Error ? err.message : "erro desconhecido",
      });
    }
  }

  async start(signal: AbortSignal): Promise<void> {
    const poll = this.deps.pollIntervalMs ?? 5_000;
    const between = this.deps.betweenJobsMs ?? 2_000;
    const dormir = this.deps.sleep ?? sleepPadrao;

    // No arranque, porque é aí que se sabe que o worker anterior morreu.
    await this.recolherOrfaos();
    let ticks = 0;

    while (!signal.aborted) {
      const result = await this.tick().catch((err) => {
        // A fila estar indisponível não pode matar o worker: espera e tenta.
        this.deps.log?.("falha no ciclo", {
          message: err instanceof Error ? err.message : "erro desconhecido",
        });
        return "idle" as const;
      });

      ticks += 1;
      if (ticks % REAP_EVERY_TICKS === 0) await this.recolherOrfaos();

      await dormir(result === "worked" ? Math.max(between, this.pacingDoCiclo) : poll);
    }
  }
}
