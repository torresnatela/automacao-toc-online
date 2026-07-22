import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getTeam } from "@/lib/teams/service";
import { signOut } from "@/app/login/actions";
import { TeamForm } from "../TeamForm";
import { updateTeamAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function EditTeamPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireRole("admin");
  if (!admin) redirect("/traces");

  const { id } = await params;
  const team = await getTeam(id);
  if (!team) notFound();

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: "0 16px" }}>
      <header
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}
      >
        <h1>Editar equipe</h1>
        <form action={signOut} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span>
            {admin.email} ({admin.role})
          </span>
          <button type="submit">Sair</button>
        </form>
      </header>

      <p>
        <Link href="/equipes">← Voltar para equipes</Link>
      </p>

      <TeamForm
        action={updateTeamAction.bind(null, id)}
        initial={team}
        title={team.name}
        submitLabel="Salvar alterações"
      />
    </main>
  );
}
