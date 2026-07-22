import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { getCompany } from "@/lib/companies/service";
import { listTeams } from "@/lib/teams/service";
import { PageHeader } from "@/components/patterns/page-header";
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
    <div>
      <Link
        href="/empresas"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Voltar para empresas
      </Link>
      <PageHeader title="Editar empresa" description={company.name} />

      <CompanyForm
        action={updateCompanyAction.bind(null, id)}
        teams={teams}
        isAdmin={user.role === "admin"}
        defaultTeamId={user.teamId}
        initial={company}
        title={company.name}
        submitLabel="Salvar alterações"
      />
    </div>
  );
}
