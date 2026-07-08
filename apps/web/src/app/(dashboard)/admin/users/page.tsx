import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { dbRoleToUiLabel, type AppRole } from "@toc/core/auth";
import { CreateUserForm } from "./CreateUserForm";

export const dynamic = "force-dynamic";

interface ProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
  role: AppRole;
  must_change_password: boolean;
}

export default async function AdminUsersPage() {
  const admin = await requireRole("admin");
  if (!admin) redirect("/traces");

  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, must_change_password")
    .order("email", { ascending: true });
  const users = (data ?? []) as ProfileRow[];

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: "0 16px" }}>
      <header
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}
      >
        <h1>Usuários</h1>
        <form action={signOut} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span>
            {admin.email} ({admin.role})
          </span>
          <button type="submit">Sair</button>
        </form>
      </header>

      <CreateUserForm />

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Email</th>
            <th style={{ textAlign: "left" }}>Nome</th>
            <th style={{ textAlign: "left" }}>Papel</th>
            <th style={{ textAlign: "left" }}>1º acesso pendente</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.email}</td>
              <td>{u.full_name ?? "—"}</td>
              <td>{dbRoleToUiLabel(u.role)}</td>
              <td>{u.must_change_password ? "Sim" : "Não"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
