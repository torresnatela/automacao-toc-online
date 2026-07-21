import { Activity, Building2, Users, UsersRound, type LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

// Todos os itens são visíveis; as páginas de área restrita fazem o gate por
// papel e redirecionam quem não tem acesso (comportamento preservado).
export const NAV_ITEMS: NavItem[] = [
  { label: "Traces", href: "/traces", icon: Activity },
  { label: "Empresas", href: "/empresas", icon: Building2 },
  { label: "Equipes", href: "/equipes", icon: UsersRound },
  { label: "Usuários", href: "/admin/users", icon: Users },
];
