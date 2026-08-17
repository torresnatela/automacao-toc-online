import { pgTable, uuid, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { jobStatus } from "./enums";
import { teams } from "./teams";

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Dono do job. NULL = job de sistema (só admin vê). A fila passou a carregar
    // dados de negócio por equipe (a varredura do TOConline), e o dashboard lê
    // esta tabela para acompanhar o progresso — sem tenant não havia como
    // escopar essa leitura.
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
    traceId: uuid("trace_id"),
    triggeringEventId: uuid("triggering_event_id"),
    type: text("type").notNull(),
    status: jobStatus("status").notNull().default("pending"),
    payload: jsonb("payload").notNull().default({}),
    result: jsonb("result"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    lastError: jsonb("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("jobs_pending_idx")
      .on(t.status, t.scheduledFor)
      .where(sql`${t.status} = 'pending'`),
    // Serve o "qual foi a última varredura desta equipe?" do dashboard.
    index("jobs_team_idx").on(t.teamId, t.type, t.status),
  ],
);
