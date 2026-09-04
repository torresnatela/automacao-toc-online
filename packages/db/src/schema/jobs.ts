import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql, desc } from "drizzle-orm";
import { jobStatus } from "./enums";
import { teams } from "./teams";
import { companies } from "./domain";

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Dono do job. NULL = job de sistema (só admin vê). A fila passou a carregar
    // dados de negócio por equipe (a varredura do TOConline), e o dashboard lê
    // esta tabela para acompanhar o progresso — sem tenant não havia como
    // escopar essa leitura.
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
    // Empresa a que o job diz respeito. null = job sem empresa (ex.: varredura);
    // `set null` e não cascade porque apagar a empresa não pode apagar o rasto
    // operacional — o histórico de execuções continua a ser o que explica o que
    // o sistema fez.
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
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
    // Serve o "qual foi o último job deste tipo para esta empresa?" — é a lateral
    // que a view iva_documents_overview faz por empresa.
    index("jobs_company_latest_idx").on(t.teamId, t.type, t.companyId, desc(t.createdAt)),
    // Idempotência por empresa garantida pela BD, não pelo código: enquanto houver
    // um job pendente/a correr para o par (empresa, tipo), um segundo pedido é
    // recusado com 23505 em vez de duplicar o trabalho de RPA. NULL fica fora do
    // índice parcial (jobs de varredura não têm empresa e podem coexistir).
    uniqueIndex("jobs_company_inflight_uq")
      .on(t.companyId, t.type)
      .where(sql`${t.status} in ('pending','running')`),
  ],
);
