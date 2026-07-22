import {
  CONTRIBUTOR_TYPES,
  COMPANY_STATUSES,
  type CompanyInput,
  type ContributorType,
  type CompanyStatus,
} from "../types";
import { isValidNif, isValidNiss } from "../validate-pt";

export type CompanyField =
  | "teamId"
  | "niss"
  | "nif"
  | "name"
  | "type"
  | "status"
  | "email"
  | "postalCode"
  | "country";

export type CompanyFieldErrors = Partial<Record<CompanyField, string>>;

const POSTAL_RE = /^\d{4}-\d{3}$/;
const COUNTRY_RE = /^[A-Za-z]{2}$/;
// Validação de email deliberadamente simples (o Auth/entidades validam de fato).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Valida a entrada de uma empresa. Retorna um mapa campo→mensagem (pt) ou `null`
 * se estiver tudo ok. Pura — testável no CI, sem Supabase.
 */
export function validateCompanyInput(input: CompanyInput): CompanyFieldErrors | null {
  const errors: CompanyFieldErrors = {};

  if (!input.teamId?.trim()) errors.teamId = "Equipe é obrigatória.";

  const niss = String(input.niss ?? "").trim();
  if (!isValidNiss(niss)) errors.niss = "NISS deve ter 11 dígitos (sem zero à esquerda).";

  const nif = (input.nif ?? "").trim();
  if (nif && !isValidNif(nif)) errors.nif = "NIF inválido (9 dígitos + dígito de controlo).";

  if (!input.name?.trim()) errors.name = "Nome é obrigatório.";

  if (!CONTRIBUTOR_TYPES.includes(input.type as ContributorType)) {
    errors.type = "Tipo de contribuinte inválido.";
  }

  if (input.status && !COMPANY_STATUSES.includes(input.status as CompanyStatus)) {
    errors.status = "Status inválido.";
  }

  const email = (input.email ?? "").trim();
  if (email && !EMAIL_RE.test(email)) errors.email = "Email inválido.";

  const postal = (input.postalCode ?? "").trim();
  if (postal && !POSTAL_RE.test(postal)) {
    errors.postalCode = "Código postal inválido (formato 1234-567).";
  }

  const country = (input.country ?? "").trim();
  if (country && !COUNTRY_RE.test(country)) {
    errors.country = "País deve ter 2 letras (ISO 3166-1 alpha-2).";
  }

  return Object.keys(errors).length > 0 ? errors : null;
}
