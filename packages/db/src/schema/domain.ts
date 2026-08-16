import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  varchar,
  bigint,
  integer,
  timestamp,
  jsonb,
  numeric,
  date,
  unique,
  uniqueIndex,
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
    // NISS e tipo de contribuinte deixaram de ser obrigatórios: a varredura do
    // TOConline não os fornece (só nome, NIF, id e cluster), e recusar a
    // importação por causa deles deixaria o sistema sem as 182 empresas reais.
    // Uma empresa com qualquer um destes nulo é "cadastro incompleto" — estado
    // DERIVADO, nunca uma coluna, para não poder divergir do que representa.
    // O cadastro manual continua a exigir ambos (ver validateCompanyInput).
    niss: bigint("niss", { mode: "number" }), // chave Segurança Social (11 dígitos)
    nif: varchar("nif", { length: 9 }), // cruzamento com AT / TOConline
    name: text("name").notNull(),
    type: contributorType("type"),
    status: companyStatus("status").notNull().default("active"),
    email: text("email"),
    phone: varchar("phone", { length: 20 }),
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    postalCode: varchar("postal_code", { length: 10 }), // formato PT: 1049-013
    city: text("city"),
    country: varchar("country", { length: 2 }).notNull().default("PT"), // ISO 3166-1 alpha-2
    notes: text("notes"),
    // Referência de "acesso direto" ao TOConline. NÃO é uma URL: entrar numa
    // empresa é impersonation por JS (switchToEntityAndNotifyPages), e o par
    // (id, cluster) é o que o worker precisa para lá chegar. Colunas e não
    // tabela de ligação porque o match do upsert e a listagem de empresas
    // querem o valor na própria linha, sem join.
    toconlineCompanyId: bigint("toconline_company_id", { mode: "number" }),
    toconlineCluster: integer("toconline_cluster"), // shard do servidor (app5, app11…)
    toconlineSyncedAt: timestamp("toconline_synced_at", { withTimezone: true }),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // NISS único POR EQUIPE (não global): duas equipes podem ter o mesmo contribuinte,
    // e a colisão não vira um oráculo de existência entre tenants.
    unique("company_niss_team_uq").on(t.teamId, t.niss),
    // NIF é a chave de deduplicação da varredura, pela mesma lógica: único por
    // equipe, não global. NULLs são distintos em Postgres, portanto empresas sem
    // NIF (entidade estrangeira, cadastro manual antigo) convivem sem colidir.
    unique("company_nif_team_uq").on(t.teamId, t.nif),
    // Identidade do lado do TOConline. É por aqui que a varredura reconhece o
    // que já importou, mesmo que o NIF mude ou falte.
    unique("company_toconline_team_uq").on(t.teamId, t.toconlineCompanyId),
    index("company_niss_idx").on(t.niss),
    index("company_nif_idx").on(t.nif),
    index("company_toconline_idx").on(t.toconlineCompanyId),
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

export const integrationCredentials = pgTable(
  "integration_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // A credencial do TOConline é do GABINETE (equipe), não de uma empresa: uma
    // conta de contabilista vê as 182 empresas dela. `company_id` continua a
    // existir e nulo passa a significar exatamente isso — credencial de nível
    // equipe. Preenchido fica reservado a credenciais por empresa (AT/SS).
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
    provider: integrationProvider("provider").notNull(),
    username: text("username"),
    // Cifrado com AES-256-GCM pela aplicação (@toc/core/crypto), no formato
    // `v1:<iv>:<tag>:<ciphertext>`. Nunca é lido por papel autenticado — a
    // tabela não tem policy de select, e o dashboard lê a view
    // integration_credentials_safe, que não expõe esta coluna.
    secretEncrypted: text("secret_encrypted"),
    status: credentialStatus("status").notNull().default("active"),
    // Metadados não-secretos do fornecedor (ex.: host shardado app5.toconline.pt).
    metadata: jsonb("metadata").notNull().default({}),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Uma credencial de gabinete por (equipe, provider); e uma por (empresa,
    // provider) quando for por empresa. Parciais porque a mesma tabela serve os
    // dois níveis e um unique simples confundiria os dois.
    uniqueIndex("credential_team_provider_uq")
      .on(t.teamId, t.provider)
      .where(sql`${t.companyId} is null`),
    uniqueIndex("credential_company_provider_uq")
      .on(t.companyId, t.provider)
      .where(sql`${t.companyId} is not null`),
    index("credential_team_idx").on(t.teamId),
  ],
);
