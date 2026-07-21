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
