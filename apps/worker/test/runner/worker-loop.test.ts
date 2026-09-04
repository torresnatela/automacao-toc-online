import { describe, it, expect } from "vitest";
import { WorkerLoop, type JobHandler, type JobOutcome } from "../../src/runner/worker-loop";
import type { ClaimedJob, JobQueue } from "../../src/runner/job-queue";
import { AtAuthError } from "../../src/errors";

const TIPO = "rpa.scan_companies";

function job(over: Partial<ClaimedJob> = {}): ClaimedJob {
  return {
    id: "job-1",
    type: TIPO,
    companyId: null,
    payload: {},
    attempts: 1,
    maxAttempts: 3,
    traceId: null,
    triggeringEventId: null,
    ...over,
  };
}

class FakeQueue {
  readonly completed: { id: string; result: unknown }[] = [];
  readonly skipped: { id: string; reason: string }[] = [];
  readonly failed: { id: string; message: string; retry: boolean }[] = [];
  /** O que efetivamente iria para `jobs.result` / `jobs.last_error` (jsonb). */
  readonly gravado: Record<string, unknown>[] = [];
  readonly deferred: { id: string; reason: string; until: Date }[] = [];
  reaped = 0;
  /** Para provar que o reaper é fail-open: a fila em baixo não trava o worker. */
  reapFalha = false;
  private fila: ClaimedJob[];

  constructor(jobs: ClaimedJob[] = []) {
    this.fila = [...jobs];
  }

  async claimNext(type: string): Promise<ClaimedJob | null> {
    const idx = this.fila.findIndex((j) => j.type === type);
    if (idx === -1) return null;
    return this.fila.splice(idx, 1)[0]!;
  }
  async complete(id: string, result: unknown) {
    this.completed.push({ id, result });
  }
  async skip(id: string, reason: string, details?: Record<string, unknown>) {
    this.skipped.push({ id, reason });
    this.gravado.push({ reason, ...details });
  }
  async fail(id: string, error: { message: string }, opts: { retry: boolean }) {
    this.failed.push({ id, message: error.message, retry: opts.retry });
    this.gravado.push({ ...error });
  }
  async defer(id: string, reason: string, until: Date) {
    this.deferred.push({ id, reason, until });
  }
  async reapStale(): Promise<number> {
    if (this.reapFalha) throw new Error("fila indisponível");
    this.reaped += 1;
    return 0;
  }
}

function handler(outcome: JobOutcome | Error): JobHandler {
  return {
    async run() {
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
  };
}

function build(queue: FakeQueue, h: JobHandler) {
  return new WorkerLoop({
    queue: queue as unknown as JobQueue,
    handlers: { [TIPO]: h },
  });
}

describe("WorkerLoop.tick", () => {
  it("fila vazia → idle, sem chamar o handler", async () => {
    const queue = new FakeQueue([]);
    let chamado = false;
    const loop = build(queue, {
      async run() {
        chamado = true;
        return { status: "succeeded", result: {} };
      },
    });

    expect(await loop.tick()).toBe("idle");
    expect(chamado).toBe(false);
  });

  it("sucesso → complete com o resultado", async () => {
    const queue = new FakeQueue([job()]);
    const loop = build(queue, handler({ status: "succeeded", result: { created: 3 } }));

    expect(await loop.tick()).toBe("worked");
    expect(queue.completed).toEqual([{ id: "job-1", result: { created: 3 } }]);
  });

  it("skip → skip com a razão", async () => {
    const queue = new FakeQueue([job()]);
    const loop = build(queue, handler({ status: "skipped", reason: "credential_invalid" }));

    await loop.tick();
    expect(queue.skipped).toEqual([{ id: "job-1", reason: "credential_invalid" }]);
  });

  it("falha propaga o retry decidido pelo handler", async () => {
    const queue = new FakeQueue([job()]);
    const loop = build(
      queue,
      handler({ status: "failed", message: "seletor partido", retry: false }),
    );

    await loop.tick();
    expect(queue.failed).toEqual([{ id: "job-1", message: "seletor partido", retry: false }]);
  });

  // Um handler bem comportado não deixa escapar exceções — mas se escapar, o
  // job não pode desaparecer em silêncio.
  it("exceção que escapa do handler vira falha retentável", async () => {
    const queue = new FakeQueue([job()]);
    const loop = build(queue, handler(new Error("boom")));

    await loop.tick();
    expect(queue.failed).toEqual([{ id: "job-1", message: "boom", retry: true }]);
  });

  // …mas "retentável" não é o mesmo que "sempre": a regra única vale também no
  // catch-all. Uma senha que a AT recusou, retentada, gasta o contador da conta
  // e bloqueia-a por dias — e o `AtAuthError` pode escapar de qualquer ponto do
  // runner, não só de onde o autor se lembrou de o apanhar.
  it("exceção estrutural que escapa do handler não é retentada", async () => {
    const queue = new FakeQueue([job()]);
    const loop = build(queue, handler(new AtAuthError("rejected")));

    await loop.tick();
    expect(queue.failed).toEqual([
      { id: "job-1", message: "A Autoridade Tributária recusou a autenticação.", retry: false },
    ]);
  });

  it("despacha cada tipo para o seu handler", async () => {
    const queue = new FakeQueue([job({ id: "a" }), job({ id: "b", type: "outro.tipo" })]);
    const vistos: string[] = [];
    const loop = new WorkerLoop({
      queue: queue as unknown as JobQueue,
      handlers: {
        [TIPO]: {
          async run(j) {
            vistos.push(`scan:${j.id}`);
            return { status: "succeeded", result: {} };
          },
        },
        "outro.tipo": {
          async run(j) {
            vistos.push(`outro:${j.id}`);
            return { status: "succeeded", result: {} };
          },
        },
      },
    });

    await loop.tick();
    expect(vistos).toEqual(["scan:a", "outro:b"]);
  });
});

describe("WorkerLoop.tick — desfechos do Módulo 1", () => {
  // Uma pausa do portal não é falha: o job volta à fila sem gastar tentativa.
  it("deferred → defer com a data em que a pausa passa", async () => {
    const queue = new FakeQueue([job()]);
    const untilMs = Date.now() + 15 * 60_000;
    const loop = build(queue, handler({ status: "deferred", reason: "portal_paused", untilMs }));

    await loop.tick();

    expect(queue.deferred).toEqual([
      { id: "job-1", reason: "portal_paused", until: new Date(untilMs) },
    ]);
    expect(queue.failed).toEqual([]);
  });

  // `last_error.outcome` é o que a view do dashboard lê para saber o desfecho.
  it("failed.code vai para last_error.outcome, com os detalhes ao lado", async () => {
    const queue = new FakeQueue([job()]);
    const loop = build(
      queue,
      handler({
        status: "failed",
        message: "O Portal das Finanças não respondeu.",
        retry: true,
        code: "at_unavailable",
        details: { stage: "at_login", period: "2026-07" },
      }),
    );

    await loop.tick();

    expect(queue.gravado).toEqual([
      {
        message: "O Portal das Finanças não respondeu.",
        outcome: "at_unavailable",
        stage: "at_login",
        period: "2026-07",
      },
    ]);
    expect(queue.failed[0]!.retry).toBe(true);
  });

  it("falha sem código não inventa outcome", async () => {
    const queue = new FakeQueue([job()]);
    const loop = build(queue, handler({ status: "failed", message: "boom", retry: true }));

    await loop.tick();

    expect(queue.gravado).toEqual([{ message: "boom" }]);
  });

  it("skipped leva os detalhes para o resultado", async () => {
    const queue = new FakeQueue([job()]);
    const loop = build(
      queue,
      handler({ status: "skipped", reason: "already_fetched", details: { period: "2026-07" } }),
    );

    await loop.tick();

    expect(queue.gravado).toEqual([{ reason: "already_fetched", period: "2026-07" }]);
  });
});

describe("WorkerLoop.start", () => {
  function loopCom(
    queue: FakeQueue,
    handlers: Record<string, JobHandler>,
    over: { betweenJobsMs?: number; sleep?: (ms: number) => Promise<void> } = {},
  ) {
    return new WorkerLoop({
      queue: queue as unknown as JobQueue,
      handlers,
      ...over,
    });
  }

  // Automatizamos o portal de um terceiro: o ritmo é do handler, não do loop.
  it("pacingMs do handler manda na pausa quando é maior que betweenJobsMs", async () => {
    const queue = new FakeQueue([job()]);
    const controller = new AbortController();
    const dormidas: number[] = [];
    const loop = loopCom(
      queue,
      {
        [TIPO]: {
          pacingMs: 5_000,
          async run() {
            return { status: "succeeded", result: {} };
          },
        },
      },
      {
        betweenJobsMs: 2_000,
        sleep: async (ms) => {
          dormidas.push(ms);
          controller.abort();
        },
      },
    );

    await loop.start(controller.signal);

    expect(dormidas).toEqual([5_000]);
  });

  it("sem pacingMs, a pausa entre jobs é a do loop", async () => {
    const queue = new FakeQueue([job()]);
    const controller = new AbortController();
    const dormidas: number[] = [];
    const loop = loopCom(
      queue,
      { [TIPO]: handler({ status: "succeeded", result: {} }) },
      {
        betweenJobsMs: 2_000,
        sleep: async (ms) => {
          dormidas.push(ms);
          controller.abort();
        },
      },
    );

    await loop.start(controller.signal);

    expect(dormidas).toEqual([2_000]);
  });

  // Um worker que morreu a meio deixa jobs `running` a segurar a idempotência
  // por empresa: o arranque tem de os recolher antes de reclamar seja o que for.
  it("recolhe os jobs órfãos no arranque", async () => {
    const queue = new FakeQueue([]);
    const controller = new AbortController();
    controller.abort();
    const loop = loopCom(queue, {}, { sleep: async () => {} });

    await loop.start(controller.signal);

    expect(queue.reaped).toBe(1);
  });

  it("um reaper que rebenta não impede o worker de arrancar", async () => {
    const queue = new FakeQueue([]);
    queue.reapFalha = true;
    const controller = new AbortController();
    controller.abort();
    const loop = loopCom(queue, {}, { sleep: async () => {} });

    await expect(loop.start(controller.signal)).resolves.toBeUndefined();
  });
});
