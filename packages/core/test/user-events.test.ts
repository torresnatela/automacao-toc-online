import { describe, expect, it } from "vitest";
import { createTracer, InMemoryStore, recordUserEvent } from "../src/observability/index";

describe("recordUserEvent", () => {
  it("registra um login bem-sucedido como trace manual + event user.login", async () => {
    const store = new InMemoryStore();
    const tracer = createTracer(store);

    await recordUserEvent(tracer, {
      action: "login",
      userId: "user-1",
      data: { email: "a@b.pt" },
    });

    const traces = [...store.traces.values()];
    const events = [...store.events.values()];
    expect(traces).toHaveLength(1);
    expect(events).toHaveLength(1);

    expect(traces[0]).toMatchObject({
      rootTrigger: "manual",
      triggerSource: "web",
      createdBy: "user-1",
      status: "completed",
    });
    expect(events[0]).toMatchObject({
      traceId: traces[0]?.id,
      parentEventId: undefined,
      type: "user.login",
      source: "web",
      status: "succeeded",
      payload: { email: "a@b.pt" },
    });
  });

  it("usa source 'web' por padrão e permite sobrescrever", async () => {
    const store = new InMemoryStore();
    const tracer = createTracer(store);

    await recordUserEvent(tracer, { action: "logout", userId: "user-1", source: "worker" });

    const event = [...store.events.values()][0];
    expect(event).toMatchObject({ type: "user.logout", source: "worker" });
  });

  it("marca event e trace como failed quando status é 'failed'", async () => {
    const store = new InMemoryStore();
    const tracer = createTracer(store);

    await recordUserEvent(tracer, {
      action: "login",
      data: { email: "a@b.pt" },
      status: "failed",
      error: { message: "credenciais inválidas" },
    });

    const trace = [...store.traces.values()][0];
    const event = [...store.events.values()][0];
    expect(trace).toMatchObject({ status: "failed" });
    expect(event).toMatchObject({
      type: "user.login",
      status: "failed",
      error: { message: "credenciais inválidas" },
    });
  });
});
