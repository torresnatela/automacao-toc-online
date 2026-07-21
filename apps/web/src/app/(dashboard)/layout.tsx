import Link from "next/link";
import type { ReactNode } from "react";

// Navegação compartilhada do dashboard (antes as páginas eram acessíveis só por
// URL). Links de área restrita (Equipes/Usuários) aparecem para todos, mas as
// páginas fazem o gate por papel e redirecionam quem não tem acesso.
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <nav
        style={{
          display: "flex",
          gap: 16,
          alignItems: "center",
          padding: "12px 16px",
          borderBottom: "1px solid #eee",
        }}
      >
        <strong style={{ marginRight: 8 }}>TOConline</strong>
        <Link href="/traces">Traces</Link>
        <Link href="/empresas">Empresas</Link>
        <Link href="/equipes">Equipes</Link>
        <Link href="/admin/users">Usuários</Link>
      </nav>
      {children}
    </>
  );
}
