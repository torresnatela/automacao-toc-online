import Link from "next/link";
import { redirect } from "next/navigation";
import { UsersRound, Pencil } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { listTeams } from "@/lib/teams/service";
import { TEAM_STATUS_LABELS, labelOf } from "@/lib/labels";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { StatusBadge } from "@/components/patterns/status-badge";
import {
  DataTable,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/patterns/data-table";
import { buttonVariants } from "@/components/ui/button";
import { TeamForm } from "./TeamForm";
import { createTeamAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function EquipesPage() {
  const admin = await requireRole("admin");
  if (!admin) redirect("/traces");

  const teams = await listTeams();

  return (
    <div>
      <PageHeader title="Equipes" description="Gabinetes de contabilidade (tenants)." />

      <TeamForm action={createTeamAction} title="Cadastrar equipe" submitLabel="Cadastrar" />

      {teams.length === 0 ? (
        <EmptyState
          icon={<UsersRound />}
          title="Nenhuma equipe ainda"
          description="Cadastre o primeiro gabinete no formulário acima."
        />
      ) : (
        <DataTable>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>NIF</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teams.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium text-foreground">{t.name}</TableCell>
                <TableCell className="text-muted-foreground">{t.nif ?? "—"}</TableCell>
                <TableCell>
                  <StatusBadge
                    kind="team"
                    value={t.status}
                    label={labelOf(TEAM_STATUS_LABELS, t.status)}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Link
                    href={`/equipes/${t.id}`}
                    className={buttonVariants({ variant: "ghost", size: "sm" })}
                  >
                    <Pencil aria-hidden /> Editar
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </DataTable>
      )}
    </div>
  );
}
