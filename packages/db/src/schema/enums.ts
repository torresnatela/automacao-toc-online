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

// --- Domínio (esqueleto; enums extensíveis por feature) ---
// Multi-tenant: equipe (gabinete de contabilidade) + empresas clientes abaixo dela.
export const teamStatus = pgEnum("team_status", ["active", "inactive"]);
// Tipo de contribuinte (define escopos de emissão adiante). Ordem = CONTRIBUTOR_TYPES em @toc/core.
export const contributorType = pgEnum("contributor_type", [
  "employer",
  "self_employed",
  "voluntary_social_insurance",
  "domestic_service",
]);
export const companyStatus = pgEnum("company_status", ["active", "inactive", "suspended"]);
export const obligationKind = pgEnum("obligation_kind", [
  "iva",
  "irs_retencao",
  "dmr",
  "ss_contribuicoes",
  "other",
]);
export const obligationFrequency = pgEnum("obligation_frequency", [
  "monthly",
  "quarterly",
  "annual",
  "other",
]);
export const obligationPeriodStatus = pgEnum("obligation_period_status", [
  "pending",
  "in_progress",
  "delivered",
  "paid",
  "skipped_nonexistent",
  "error",
  "not_applicable",
]);
export const documentStatus = pgEnum("document_status", ["extracted", "sent", "error"]);
export const integrationProvider = pgEnum("integration_provider", [
  "toconline",
  "at",
  "seguranca_social",
  "efatura",
]);
export const credentialStatus = pgEnum("credential_status", ["active", "expired", "invalid"]);
