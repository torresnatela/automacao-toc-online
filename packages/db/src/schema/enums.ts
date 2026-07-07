import { pgEnum } from "drizzle-orm/pg-core";

export const appRole = pgEnum("app_role", ["admin", "operator", "viewer"]);
export const triggerKind = pgEnum("trigger_kind", ["webhook", "schedule", "manual", "system"]);
export const traceStatus = pgEnum("trace_status", ["open", "completed", "failed"]);
export const eventStatus = pgEnum("event_status", [
  "pending",
  "in_progress",
  "succeeded",
  "failed",
  "skipped",
]);
export const logLevel = pgEnum("log_level", ["debug", "info", "warn", "error"]);
export const jobStatus = pgEnum("job_status", [
  "pending",
  "running",
  "succeeded",
  "failed",
  "skipped",
  "cancelled",
]);
