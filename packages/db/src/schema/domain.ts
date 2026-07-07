import { pgTable, uuid, text, timestamp, jsonb, numeric, date, unique } from "drizzle-orm/pg-core";
import {
  clientStatus,
  obligationKind,
  obligationFrequency,
  obligationPeriodStatus,
  documentStatus,
  integrationProvider,
  credentialStatus,
} from "./enums";

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  nif: text("nif"),
  email: text("email"),
  status: clientStatus("status").notNull().default("active"),
  toconlineRef: text("toconline_ref"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const obligations = pgTable("obligations", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  kind: obligationKind("kind").notNull(),
  frequency: obligationFrequency("frequency").notNull().default("monthly"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const obligationPeriods = pgTable(
  "obligation_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    obligationId: uuid("obligation_id")
      .notNull()
      .references(() => obligations.id, { onDelete: "cascade" }),
    period: text("period").notNull(),
    status: obligationPeriodStatus("status").notNull().default("pending"),
    dueDate: date("due_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("obligation_period_uq").on(t.obligationId, t.period)],
);

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  obligationPeriodId: uuid("obligation_period_id")
    .notNull()
    .references(() => obligationPeriods.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  entity: text("entity"),
  reference: text("reference"),
  amount: numeric("amount", { precision: 12, scale: 2 }),
  validUntil: date("valid_until"),
  storagePath: text("storage_path"),
  status: documentStatus("status").notNull().default("extracted"),
  extractedAt: timestamp("extracted_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const integrationCredentials = pgTable("integration_credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
  provider: integrationProvider("provider").notNull(),
  username: text("username"),
  // Criptografado em repouso (mecanismo planejado: Supabase Vault / pgsodium). Não implementado nesta base.
  secretEncrypted: text("secret_encrypted"),
  status: credentialStatus("status").notNull().default("active"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
