// Papéis do domínio. A ORDEM deve bater com o pgEnum `app_role` em
// packages/db/src/schema/enums.ts (["admin", "operator", "viewer"]).
export const APP_ROLES = ["admin", "operator", "viewer"] as const;
export type AppRole = (typeof APP_ROLES)[number];

// Hierarquia (menor → maior) usada por requireRole(min) no dashboard.
export const ROLE_ORDER: AppRole[] = ["viewer", "operator", "admin"];

// Papéis oferecidos no formulário de cadastro (só dois, por enquanto).
// "member" mapeia para o papel base `viewer` (default do trigger).
export type UiRole = "admin" | "member";

export function uiRoleToDbRole(ui: UiRole): AppRole {
  return ui === "admin" ? "admin" : "viewer";
}

const DB_ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin",
  operator: "Operator",
  viewer: "Member",
};

export function dbRoleToUiLabel(role: AppRole): string {
  return DB_ROLE_LABEL[role];
}
