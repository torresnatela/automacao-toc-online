import type { LogLevel } from "./types";
import type { ObservabilityStore } from "./store";

/** Logger ligado a um trace (e opcionalmente a um event). Grava no store e no stdout. */
export class Logger {
  constructor(
    private readonly store: ObservabilityStore,
    private readonly traceId: string,
    private readonly eventId?: string,
  ) {}

  private async write(level: LogLevel, message: string, data: Record<string, unknown> = {}) {
    const rec = {
      id: this.store.newId(),
      traceId: this.traceId,
      eventId: this.eventId,
      level,
      message,
      data,
      loggedAt: new Date(),
    };
    const line = JSON.stringify({
      traceId: this.traceId,
      eventId: this.eventId,
      level,
      message,
      ...data,
    });
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
    await this.store.saveLog(rec);
  }

  debug(message: string, data?: Record<string, unknown>) {
    return this.write("debug", message, data);
  }
  info(message: string, data?: Record<string, unknown>) {
    return this.write("info", message, data);
  }
  warn(message: string, data?: Record<string, unknown>) {
    return this.write("warn", message, data);
  }
  error(message: string, data?: Record<string, unknown>) {
    return this.write("error", message, data);
  }
}
