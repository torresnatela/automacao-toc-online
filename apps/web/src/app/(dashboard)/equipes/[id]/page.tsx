import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { getTeam } from "@/lib/teams/service";
import { PageHeader } from "@/components/patterns/page-header";
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
    <div>
      <Link
        href="/equipes"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Voltar para equipes
      </Link>
      <PageHeader title="Editar equipe" description={team.name} />

      <TeamForm
        action={updateTeamAction.bind(null, id)}
        initial={team}
        title={team.name}
        submitLabel="Salvar alterações"
      />
    </div>
  );
}
