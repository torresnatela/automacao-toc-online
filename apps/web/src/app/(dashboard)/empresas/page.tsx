import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, Pencil } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { listCompanies } from "@/lib/companies/service";
import { listTeams } from "@/lib/teams/service";
import { CONTRIBUTOR_TYPE_LABELS, COMPANY_STATUS_LABELS, labelOf } from "@/lib/labels";
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
    <div>
      <PageHeader title="Empresas" description="Contribuintes sob gestão do gabinete." />

      <CompanyForm
        action={createCompanyAction}
        teams={teams}
        isAdmin={user.role === "admin"}
        defaultTeamId={user.teamId}
        title="Cadastrar empresa"
        submitLabel="Cadastrar"
      />

      {companies.length === 0 ? (
        <EmptyState
          icon={<Building2 />}
          title="Nenhuma empresa ainda"
          description="Cadastre a primeira empresa no formulário acima."
        />
      ) : (
        <DataTable>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>NISS</TableHead>
              <TableHead>NIF</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium text-foreground">{c.name}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{c.niss}</TableCell>
                <TableCell className="text-muted-foreground">{c.nif ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {labelOf(CONTRIBUTOR_TYPE_LABELS, c.type)}
                </TableCell>
                <TableCell>
                  <StatusBadge
                    kind="company"
                    value={c.status}
                    label={labelOf(COMPANY_STATUS_LABELS, c.status)}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Link
                    href={`/empresas/${c.id}`}
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
