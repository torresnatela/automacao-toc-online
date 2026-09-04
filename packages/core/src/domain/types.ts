// Tipos de domínio compartilhados (empresas + equipes). As listas `as const`
// devem bater com os pgEnum em packages/db/src/schema/enums.ts.

export const CONTRIBUTOR_TYPES = [
  "employer",
  "self_employed",
  "voluntary_social_insurance",
  "domestic_service",
] as const;
export type ContributorType = (typeof CONTRIBUTOR_TYPES)[number];

export const COMPANY_STATUSES = ["active", "inactive", "suspended"] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];

export const TEAM_STATUSES = ["active", "inactive"] as const;
export type TeamStatus = (typeof TEAM_STATUSES)[number];

/** Entrada do cadastro/edição de empresa (valores crus vindos do form/JSON). */
export interface CompanyInput {
  teamId: string;
  niss: string | number;
  nif?: string | null;
  name: string;
  type: ContributorType;
  status?: CompanyStatus;
  email?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  notes?: string | null;
}

/** Registro normalizado, pronto para persistência (niss como número). */
export interface CompanyRecord {
  teamId: string;
  niss: number;
  nif: string | null;
  name: string;
  type: ContributorType;
  status: CompanyStatus;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  notes: string | null;
}

/** Entrada do cadastro/edição de equipe (gabinete de contabilidade). */
export interface TeamInput {
  name: string;
  nif?: string | null;
  status?: TeamStatus;
}

/** Registro normalizado de equipe. */
export interface TeamRecord {
  name: string;
  nif: string | null;
  status: TeamStatus;
}

// ---------------------------------------------------------------------------
// Obrigações fiscais e documentos
// ---------------------------------------------------------------------------
// As listas abaixo espelham os pgEnum de packages/db/src/schema/enums.ts —
// se um mudar, o outro muda junto.

export const OBLIGATION_KINDS = [
  "iva",
  "irs_retencao",
  "dmr",
  "ss_contribuicoes",
  "other",
] as const;
export type ObligationKind = (typeof OBLIGATION_KINDS)[number];

export const OBLIGATION_FREQUENCIES = ["monthly", "quarterly", "annual", "other"] as const;
export type ObligationFrequency = (typeof OBLIGATION_FREQUENCIES)[number];

export const OBLIGATION_PERIOD_STATUSES = [
  "pending",
  "in_progress",
  "delivered",
  "paid",
  "skipped_nonexistent",
  "error",
  "not_applicable",
] as const;
export type ObligationPeriodStatus = (typeof OBLIGATION_PERIOD_STATUSES)[number];

export const DOCUMENT_STATUSES = ["extracted", "sent", "error"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];
