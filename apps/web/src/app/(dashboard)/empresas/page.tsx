import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { listCompanies } from "@/lib/companies/service";
import { listTeams } from "@/lib/teams/service";
import { signOut } from "@/app/login/actions";
import { CONTRIBUTOR_TYPE_LABELS, COMPANY_STATUS_LABELS, labelOf } from "@/lib/labels";
import { CompanyForm } from "./CompanyForm";
import { createCompanyAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function EmpresasPage() {
  // Gerir empresas exige operator+ (o mesmo papel que o service exige na escrita);
  // viewers não veem um formulário que só levaria 403.
  const user = await requireRole("operator");
  if (!user) redirect("/traces");

  const companies = await listCompanies();
  // Admin escolhe a equipe no cadastro; operador usa a própria (fixada no service).
  const teams = user.role === "admin" ? await listTeams() : [];

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: "0 16px" }}>
      <header
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}
      >
        <h1>Empresas</h1>
        <form action={signOut} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span>
            {user.email} ({user.role})
          </span>
          <button type="submit">Sair</button>
        </form>
      </header>

      <CompanyForm
        action={createCompanyAction}
        teams={teams}
        isAdmin={user.role === "admin"}
        defaultTeamId={user.teamId}
        title="Cadastrar empresa"
        submitLabel="Cadastrar"
      />

      {companies.length === 0 ? (
        <p>Nenhuma empresa ainda.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Nome</th>
              <th style={{ textAlign: "left" }}>NISS</th>
              <th style={{ textAlign: "left" }}>NIF</th>
              <th style={{ textAlign: "left" }}>Tipo</th>
              <th style={{ textAlign: "left" }}>Status</th>
              <th style={{ textAlign: "left" }}></th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.niss}</td>
                <td>{c.nif ?? "—"}</td>
                <td>{labelOf(CONTRIBUTOR_TYPE_LABELS, c.type)}</td>
                <td>{labelOf(COMPANY_STATUS_LABELS, c.status)}</td>
                <td>
                  <Link href={`/empresas/${c.id}`}>Editar</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
