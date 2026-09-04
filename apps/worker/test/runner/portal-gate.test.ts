import { describe, it, expect } from "vitest";
import { InMemoryPortalGate } from "../../src/runner/portal-gate";

/**
 * A trava existe para um cenário concreto: a AT em baixo entre os dias 20 e 25
 * e 182 jobs na fila. Sem ela, cada um abre o browser, espera o timeout e gasta
 * uma tentativa contra um portal que não está lá.
 */

/** Relógio controlado: o teste não espera 15 minutos. */
function relogio(inicio = 1_000_000) {
  let agora = inicio;
  return {
    clock: () => agora,
    avancar: (ms: number) => {
      agora += ms;
    },
  };
}

describe("InMemoryPortalGate", () => {
  it("começa aberto", async () => {
    const gate = new InMemoryPortalGate();
    expect(await gate.isPaused()).toEqual({ paused: false });
  });

  it("trip fecha o portal por 15 minutos", async () => {
    const { clock, avancar } = relogio();
    const gate = new InMemoryPortalGate({ clock });

    await gate.trip("at_unavailable");

    expect(await gate.isPaused()).toEqual({ paused: true, untilMs: clock() + 15 * 60_000 });
    avancar(15 * 60_000 - 1);
    expect((await gate.isPaused()).paused).toBe(true);
  });

  it("passada a pausa, reabre sozinho", async () => {
    const { clock, avancar } = relogio();
    const gate = new InMemoryPortalGate({ clock });

    await gate.trip("at_unavailable");
    avancar(15 * 60_000);

    expect(await gate.isPaused()).toEqual({ paused: false });
  });

  it("a duração da pausa é configurável", async () => {
    const { clock, avancar } = relogio();
    const gate = new InMemoryPortalGate({ pauseMs: 60_000, clock });

    await gate.trip("at_unavailable");
    avancar(59_999);
    expect((await gate.isPaused()).paused).toBe(true);
    avancar(1);
    expect((await gate.isPaused()).paused).toBe(false);
  });

  // Um `trip` durante uma pausa estende-a: o portal continua em baixo.
  it("trip durante a pausa adia o reabrir", async () => {
    const { clock, avancar } = relogio();
    const gate = new InMemoryPortalGate({ clock });

    await gate.trip("at_unavailable");
    avancar(10 * 60_000);
    await gate.trip("at_unavailable");

    expect(await gate.isPaused()).toEqual({ paused: true, untilMs: clock() + 15 * 60_000 });
  });

  it("reset reabre à força", async () => {
    const { clock } = relogio();
    const gate = new InMemoryPortalGate({ clock });

    await gate.trip("at_unavailable");
    await gate.reset();

    expect(await gate.isPaused()).toEqual({ paused: false });
  });
});
