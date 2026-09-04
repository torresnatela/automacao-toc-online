import type { PortalGate } from "./ports";

/**
 * Trava do acesso à AT, em memória.
 *
 * Em memória chega porque o worker é serial e único: o estado que interessa é
 * "o portal respondeu mal agora mesmo", e esse morre com o processo — um worker
 * novo deve mesmo voltar a experimentar. Um `trip()` põe os jobs seguintes em
 * `deferred` (voltam à fila **sem gastar tentativa**) durante a pausa, em vez
 * de 182 jobs abrirem o browser um atrás do outro contra um portal em baixo.
 */
export interface PortalGateOptions {
  /** Quanto dura a pausa. 15 min: o suficiente para uma manutenção curta passar. */
  pauseMs?: number;
  /** Injetável nos testes — ninguém espera 15 minutos por uma asserção. */
  clock?: () => number;
}

export class InMemoryPortalGate implements PortalGate {
  private readonly pauseMs: number;
  private readonly clock: () => number;
  /** Instante em que a pausa acaba; `null` = portal aberto. */
  private ateMs: number | null = null;

  constructor(options: PortalGateOptions = {}) {
    this.pauseMs = options.pauseMs ?? 15 * 60_000;
    this.clock = options.clock ?? Date.now;
  }

  async isPaused(): Promise<{ paused: false } | { paused: true; untilMs: number }> {
    if (this.ateMs === null) return { paused: false };
    if (this.clock() >= this.ateMs) {
      // Reabre sozinho: a pausa é uma espera, não um estado a limpar à mão.
      this.ateMs = null;
      return { paused: false };
    }
    return { paused: true, untilMs: this.ateMs };
  }

  /** Uma nova indisponibilidade durante a pausa estende-a: o portal continua mal. */
  async trip(_reason: string): Promise<void> {
    this.ateMs = this.clock() + this.pauseMs;
  }

  async reset(): Promise<void> {
    this.ateMs = null;
  }
}
