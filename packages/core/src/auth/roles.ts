// Papéis do domínio. A ORDEM deve bater com o pgEnum `app_role` em
// packages/db/src/schema/enums.ts (["admin", "operator", "viewer"]).
export const APP_ROLES = ["admin", "operator", "viewer"] as const;
export type AppRole = (typeof APP_ROLES)[number];

// Hierarquia (menor → maior) usada por requireRole(min) no dashboard.
export const ROLE_ORDER: readonly AppRole[] = ["viewer", "operator", "admin"];

// Papéis oferecidos no formulário de cadastro. "member" mapeia para o papel base
// `viewer` (default do trigger); "operator" é o papel que gere empresas da equipe.
export type UiRole = "admin" | "operator" | "member";

export function uiRoleToDbRole(ui: UiRole): AppRole {
  if (ui === "admin") return "admin";
  if (ui === "operator") return "operator";
  return "viewer";
}

const DB_ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin",
  operator: "Operator",
  viewer: "Member",
};

export function dbRoleToUiLabel(role: AppRole): string {
  return DB_ROLE_LABEL[role];
}
