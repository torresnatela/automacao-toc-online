import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getCompany } from "@/lib/companies/service";
import { listTeams } from "@/lib/teams/service";
import { signOut } from "@/app/login/actions";
import { CompanyForm } from "../CompanyForm";
import { updateCompanyAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function EditCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("operator"); // gerir empresas exige operator+
  if (!user) redirect("/traces");

  const { id } = await params;
  const company = await getCompany(id);
  if (!company) notFound();

  const teams = user.role === "admin" ? await listTeams() : [];

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: "0 16px" }}>
      <header
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}
      >
        <h1>Editar empresa</h1>
        <form action={signOut} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span>
            {user.email} ({user.role})
          </span>
          <button type="submit">Sair</button>
        </form>
      </header>

      <p>
        <Link href="/empresas">← Voltar para empresas</Link>
      </p>

      <CompanyForm
        action={updateCompanyAction.bind(null, id)}
        teams={teams}
        isAdmin={user.role === "admin"}
        defaultTeamId={user.teamId}
        initial={company}
        title={company.name}
        submitLabel="Salvar alterações"
      />
    </main>
  );
}
