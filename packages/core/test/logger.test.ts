import { describe, it, expect, beforeEach } from "vitest";
import { createTracer, InMemoryStore } from "../src/observability/index";

let store: InMemoryStore;
beforeEach(() => {
  store = new InMemoryStore();
});

describe("logger", () => {
  it("grava logs ligados ao trace e ao event", async () => {
    const trace = await createTracer(store).startTrace({ rootTrigger: "manual" });
    const evt = await trace.event({ type: "x", source: "t" });
    await evt.log.info("mensagem", { k: 1 });
    await evt.log.error("falhou", { code: "E1" });
    const logs = [...store.logs.values()];
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatchObject({
      traceId: trace.id,
      eventId: evt.id,
      level: "info",
      message: "mensagem",
    });
    expect(logs[1]).toMatchObject({ level: "error", data: { code: "E1" } });
  });
});
