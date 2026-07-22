import {
  Activity,
  Building2,
  Plug,
  ScrollText,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

// Todos os itens são visíveis; as páginas de área restrita fazem o gate por
// papel e redirecionam quem não tem acesso (comportamento preservado).
export const NAV_ITEMS: NavItem[] = [
  // Tela inicial (vinda da main): integrações que a automação usa.
  { label: "Integrações", href: "/", icon: Plug },
  { label: "Traces", href: "/traces", icon: Activity },
  // Módulo de logs (vindo do merge da main): eventos de usuário/sistema + drill-down.
  { label: "Logs", href: "/logs", icon: ScrollText },
  { label: "Empresas", href: "/empresas", icon: Building2 },
  { label: "Equipes", href: "/equipes", icon: UsersRound },
  { label: "Usuários", href: "/admin/users", icon: Users },
];
