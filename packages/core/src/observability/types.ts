export type TriggerKind = "webhook" | "schedule" | "manual" | "system";
export type TraceStatus = "open" | "completed" | "failed";
export type EventStatus = "pending" | "in_progress" | "succeeded" | "failed" | "skipped";
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface TraceRecord {
  id: string;
  rootTrigger: TriggerKind;
  triggerSource?: string | null;
  correlationKey?: string | null;
  status: TraceStatus;
  createdBy?: string | null;
  startedAt: Date;
  endedAt?: Date | null;
}

export interface EventRecord {
  id: string;
  traceId: string;
  parentEventId?: string | null;
  type: string;
  source: string;
  status: EventStatus;
  payload: Record<string, unknown>;
  error?: unknown;
  occurredAt: Date;
  durationMs?: number | null;
}

export interface LogRecord {
  id: string;
  traceId: string;
  eventId?: string | null;
  level: LogLevel;
  message: string;
  data: Record<string, unknown>;
  loggedAt: Date;
}

export interface StartTraceInput {
  rootTrigger: TriggerKind;
  triggerSource?: string;
  correlationKey?: string;
  createdBy?: string;
}

export interface EventInput {
  type: string;
  source: string;
  payload?: Record<string, unknown>;
}

export interface ErrorInput {
  message: string;
  [k: string]: unknown;
}
