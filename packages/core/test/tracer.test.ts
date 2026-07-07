import { describe, it, expect, beforeEach } from "vitest";
import { createTracer, InMemoryStore } from "../src/observability/index";

let store: InMemoryStore;
beforeEach(() => {
  store = new InMemoryStore();
});

describe("tracer", () => {
  it("cria um trace aberto com o gatilho informado", async () => {
    const tracer = createTracer(store);
    const trace = await tracer.startTrace({ rootTrigger: "webhook", triggerSource: "/hook" });
    expect(store.traces.get(trace.id)?.status).toBe("open");
    expect(store.traces.get(trace.id)?.rootTrigger).toBe("webhook");
  });

  it("liga event ao trace e child ao parent (árvore causal)", async () => {
    const tracer = createTracer(store);
    const trace = await tracer.startTrace({ rootTrigger: "manual" });
    const parent = await trace.event({ type: "a", source: "test" });
    const child = await parent.child({ type: "b", source: "test" });
    expect(store.events.get(parent.id)?.traceId).toBe(trace.id);
    expect(store.events.get(child.id)?.parentEventId).toBe(parent.id);
    expect(store.events.get(child.id)?.traceId).toBe(trace.id);
  });

  it("succeed/fail/skip mudam o status do event", async () => {
    const tracer = createTracer(store);
    const trace = await tracer.startTrace({ rootTrigger: "system" });
    const e1 = await trace.event({ type: "ok", source: "t" });
    await e1.succeed({ durationMs: 5 });
    const e2 = await trace.event({ type: "bad", source: "t" });
    await e2.fail({ message: "boom" });
    const e3 = await trace.event({ type: "none", source: "t" });
    await e3.skip("documento inexistente");
    expect(store.events.get(e1.id)?.status).toBe("succeeded");
    expect(store.events.get(e1.id)?.durationMs).toBe(5);
    expect(store.events.get(e2.id)?.status).toBe("failed");
    expect(store.events.get(e3.id)?.status).toBe("skipped");
  });

  it("complete()/fail() fecham o trace", async () => {
    const tracer = createTracer(store);
    const t1 = await tracer.startTrace({ rootTrigger: "manual" });
    await t1.complete();
    const t2 = await tracer.startTrace({ rootTrigger: "manual" });
    await t2.fail({ message: "x" });
    expect(store.traces.get(t1.id)?.status).toBe("completed");
    expect(store.traces.get(t2.id)?.status).toBe("failed");
    expect(store.traces.get(t1.id)?.endedAt).toBeInstanceOf(Date);
  });
});
