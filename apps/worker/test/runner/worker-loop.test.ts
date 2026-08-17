import { describe, it, expect } from "vitest";
import { WorkerLoop, type JobHandler, type JobOutcome } from "../../src/runner/worker-loop";
import type { ClaimedJob, JobQueue } from "../../src/runner/job-queue";

const TIPO = "rpa.scan_companies";

function job(over: Partial<ClaimedJob> = {}): ClaimedJob {
  return {
    id: "job-1",
    type: TIPO,
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
  async skip(id: string, reason: string) {
    this.skipped.push({ id, reason });
  }
  async fail(id: string, error: { message: string }, opts: { retry: boolean }) {
    this.failed.push({ id, message: error.message, retry: opts.retry });
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
    const loop = build(queue, handler({ status: "failed", message: "seletor partido", retry: false }));

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
