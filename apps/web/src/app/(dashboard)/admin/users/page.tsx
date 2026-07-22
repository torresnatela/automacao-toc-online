import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { listTeams } from "@/lib/teams/service";
import { dbRoleToUiLabel, type AppRole } from "@toc/core/auth";
import { CreateUserForm } from "./CreateUserForm";

export const dynamic = "force-dynamic";

interface ProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
  role: AppRole;
  must_change_password: boolean;
  team_id: string | null;
}

export default async function AdminUsersPage() {
  const admin = await requireRole("admin");
  if (!admin) redirect("/");

  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, must_change_password, team_id")
    .order("email", { ascending: true });
  const users = (data ?? []) as ProfileRow[];

  const teams = await listTeams();
  const teamName = new Map(teams.map((t) => [t.id, t.name]));

  return (
    <section>
      <h1>Usuários</h1>

      <CreateUserForm teams={teams} />

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Email</th>
            <th style={{ textAlign: "left" }}>Nome</th>
            <th style={{ textAlign: "left" }}>Papel</th>
            <th style={{ textAlign: "left" }}>Equipe</th>
            <th style={{ textAlign: "left" }}>1º acesso pendente</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.email}</td>
              <td>{u.full_name ?? "—"}</td>
              <td>{dbRoleToUiLabel(u.role)}</td>
              <td>{u.team_id ? (teamName.get(u.team_id) ?? "—") : "—"}</td>
              <td>{u.must_change_password ? "Sim" : "Não"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
