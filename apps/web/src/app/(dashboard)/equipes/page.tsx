import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { listTeams } from "@/lib/teams/service";
import { signOut } from "@/app/login/actions";
import { TEAM_STATUS_LABELS, labelOf } from "@/lib/labels";
import { TeamForm } from "./TeamForm";
import { createTeamAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function EquipesPage() {
  const admin = await requireRole("admin");
  if (!admin) redirect("/traces");

  const teams = await listTeams();

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: "0 16px" }}>
      <header
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}
      >
        <h1>Equipes</h1>
        <form action={signOut} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span>
            {admin.email} ({admin.role})
          </span>
          <button type="submit">Sair</button>
        </form>
      </header>

      <TeamForm action={createTeamAction} title="Cadastrar equipe" submitLabel="Cadastrar" />

      {teams.length === 0 ? (
        <p>Nenhuma equipe ainda.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Nome</th>
              <th style={{ textAlign: "left" }}>NIF</th>
              <th style={{ textAlign: "left" }}>Status</th>
              <th style={{ textAlign: "left" }}></th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>{t.nif ?? "—"}</td>
                <td>{labelOf(TEAM_STATUS_LABELS, t.status)}</td>
                <td>
                  <Link href={`/equipes/${t.id}`}>Editar</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
