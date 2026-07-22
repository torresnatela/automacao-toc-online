import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { listTeams } from "@/lib/teams/service";
import { dbRoleToUiLabel, type AppRole } from "@toc/core/auth";
import { PageHeader } from "@/components/patterns/page-header";
import { StatusBadge } from "@/components/patterns/status-badge";
import { Badge } from "@/components/ui/badge";
import {
  DataTable,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/patterns/data-table";
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
    <div>
      <PageHeader title="Usuários" description="Contas com acesso ao painel." />

      <CreateUserForm teams={teams} />

      <DataTable>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Nome</TableHead>
            <TableHead>Papel</TableHead>
            <TableHead>Equipe</TableHead>
            <TableHead>1º acesso</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-medium text-foreground">{u.email}</TableCell>
              <TableCell className="text-muted-foreground">{u.full_name ?? "—"}</TableCell>
              <TableCell>
                <StatusBadge kind="role" value={u.role} label={dbRoleToUiLabel(u.role)} />
              </TableCell>
              <TableCell className="text-muted-foreground">
                {u.team_id ? (teamName.get(u.team_id) ?? "—") : "—"}
              </TableCell>
              <TableCell>
                {u.must_change_password ? (
                  <Badge tone="warning">Pendente</Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </DataTable>
    </div>
  );
}
