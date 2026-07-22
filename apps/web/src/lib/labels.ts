// Rótulos em português para os enums de domínio (UI). Mantidos em sync com
// packages/db/src/schema/enums.ts / @toc/core/domain.

export const CONTRIBUTOR_TYPE_LABELS: Record<string, string> = {
  employer: "Entidade empregadora",
  self_employed: "Trabalhador independente",
  voluntary_social_insurance: "Seguro social voluntário",
  domestic_service: "Serviço doméstico",
};

export const COMPANY_STATUS_LABELS: Record<string, string> = {
  active: "Ativa",
  inactive: "Inativa",
  suspended: "Suspensa",
};

export const TEAM_STATUS_LABELS: Record<string, string> = {
  active: "Ativa",
  inactive: "Inativa",
};

export function labelOf(map: Record<string, string>, key: string): string {
  return map[key] ?? key;
}
