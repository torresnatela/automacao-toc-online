import {
  pgTable,
  uuid,
  text,
  varchar,
  bigint,
  timestamp,
  jsonb,
  numeric,
  date,
  unique,
  index,
} from "drizzle-orm/pg-core";
import {
  companyStatus,
  contributorType,
  obligationKind,
  obligationFrequency,
  obligationPeriodStatus,
  documentStatus,
  integrationProvider,
  credentialStatus,
} from "./enums";
import { teams } from "./teams";

// Empresa cliente (contribuinte). Chave de operações da Segurança Social = NISS.
// Pertence a uma equipe (tenant). Substitui a antiga tabela `clients`.
export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    niss: bigint("niss", { mode: "number" }).notNull(), // chave Segurança Social (11 dígitos)
    nif: varchar("nif", { length: 9 }), // cruzamento com AT / TOConline
    name: text("name").notNull(),
    type: contributorType("type").notNull(),
    status: companyStatus("status").notNull().default("active"),
    email: text("email"),
    phone: varchar("phone", { length: 20 }),
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    postalCode: varchar("postal_code", { length: 10 }), // formato PT: 1049-013
    city: text("city"),
    country: varchar("country", { length: 2 }).notNull().default("PT"), // ISO 3166-1 alpha-2
    notes: text("notes"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // NISS único POR EQUIPE (não global): duas equipes podem ter o mesmo contribuinte,
    // e a colisão não vira um oráculo de existência entre tenants.
    unique("company_niss_team_uq").on(t.teamId, t.niss),
    index("company_niss_idx").on(t.niss),
    index("company_status_idx").on(t.status),
    index("company_team_idx").on(t.teamId),
  ],
);

export const obligations = pgTable("obligations", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
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
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
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
