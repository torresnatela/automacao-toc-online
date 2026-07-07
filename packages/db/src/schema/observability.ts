import { pgTable, uuid, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { triggerKind, traceStatus, eventStatus, logLevel } from "./enums";

export const traces = pgTable("traces", {
  id: uuid("id").primaryKey().defaultRandom(),
  rootTrigger: triggerKind("root_trigger").notNull(),
  triggerSource: text("trigger_source"),
  correlationKey: text("correlation_key"),
  status: traceStatus("status").notNull().default("open"),
  metadata: jsonb("metadata").notNull().default({}),
  createdBy: uuid("created_by"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    traceId: uuid("trace_id")
      .notNull()
      .references(() => traces.id, { onDelete: "cascade" }),
    parentEventId: uuid("parent_event_id"),
    type: text("type").notNull(),
    source: text("source").notNull(),
    status: eventStatus("status").notNull().default("pending"),
    payload: jsonb("payload").notNull().default({}),
    error: jsonb("error"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("events_trace_id_idx").on(t.traceId),
    index("events_parent_idx").on(t.parentEventId),
    index("events_type_idx").on(t.type),
    index("events_occurred_at_idx").on(t.occurredAt),
  ],
);

export const logs = pgTable(
  "logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    traceId: uuid("trace_id")
      .notNull()
      .references(() => traces.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "cascade" }),
    level: logLevel("level").notNull(),
    message: text("message").notNull(),
    data: jsonb("data").notNull().default({}),
    loggedAt: timestamp("logged_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("logs_trace_id_idx").on(t.traceId),
    index("logs_event_id_idx").on(t.eventId),
    index("logs_level_idx").on(t.level),
  ],
);
