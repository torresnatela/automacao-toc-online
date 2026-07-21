import { redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/auth";
import { signOut } from "@/app/login/actions";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", padding: "0 16px" }}>
      <header
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}
      >
        <nav style={{ display: "flex", gap: 16 }}>
          <Link href="/">Integrações</Link>
          <Link href="/logs">Logs</Link>
          {user.role === "admin" && <Link href="/admin/users">Usuários</Link>}
        </nav>
        <form action={signOut} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span>
            {user.email} ({user.role})
          </span>
          <button type="submit">Sair</button>
        </form>
      </header>

      {children}
    </div>
  );
}
