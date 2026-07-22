import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/auth";
import { AppShell } from "@/components/app-shell/app-shell";

export const dynamic = "force-dynamic";

// Casca compartilhada do dashboard. Busca a sessão uma vez e envolve as páginas
// na AppShell (sidebar + topbar). As páginas mantêm seu próprio gate por papel.
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return <AppShell user={{ email: user.email ?? "—", role: user.role }}>{children}</AppShell>;
}
