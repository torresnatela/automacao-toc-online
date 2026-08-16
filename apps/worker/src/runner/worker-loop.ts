import type { ClaimedJob, JobQueue } from "./job-queue";

/**
 * Consome a fila: reclama um job de cada tipo registado, despacha-o para o
 * handler e traduz o desfecho em transição de estado.
 *
 * `tick()` é público e faz exatamente uma passagem, sem temporizadores — é o
 * que torna o loop testável sem relógios falsos nem esperas. `start()` é só
 * `tick()` em repetição até ao sinal de paragem.
 */

export type JobOutcome =
  | { status: "succeeded"; result: unknown }
  | { status: "skipped"; reason: string }
  | { status: "failed"; message: string; retry: boolean };

export interface JobHandler {
  run(job: ClaimedJob): Promise<JobOutcome>;
}

export interface WorkerLoopDeps {
  queue: JobQueue;
  /** Chave = `jobs.type`. */
  handlers: Record<string, JobHandler>;
  pollIntervalMs?: number;
  /** Pausa entre jobs: automatizamos o portal de um terceiro, sem pressa. */
  betweenJobsMs?: number;
  log?: (message: string, data?: Record<string, unknown>) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class WorkerLoop {
  constructor(private readonly deps: WorkerLoopDeps) {}

  /** Uma passagem por todos os tipos registados. */
  async tick(): Promise<"idle" | "worked"> {
    let worked = false;

    for (const [type, handler] of Object.entries(this.deps.handlers)) {
      const job = await this.deps.queue.claimNext(type);
      if (!job) continue;
      worked = true;

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

      if (outcome.status === "succeeded") {
        await this.deps.queue.complete(job.id, outcome.result);
      } else if (outcome.status === "skipped") {
        await this.deps.queue.skip(job.id, outcome.reason);
      } else {
        await this.deps.queue.fail(job.id, { message: outcome.message }, { retry: outcome.retry });
      }

      this.deps.log?.("job terminado", { jobId: job.id, status: outcome.status });
    }

    return worked ? "worked" : "idle";
  }

  async start(signal: AbortSignal): Promise<void> {
    const poll = this.deps.pollIntervalMs ?? 5_000;
    const between = this.deps.betweenJobsMs ?? 2_000;

    while (!signal.aborted) {
      const result = await this.tick().catch((err) => {
        // A fila estar indisponível não pode matar o worker: espera e tenta.
        this.deps.log?.("falha no ciclo", {
          message: err instanceof Error ? err.message : "erro desconhecido",
        });
        return "idle" as const;
      });

      await sleep(result === "worked" ? between : poll);
    }
  }
}
