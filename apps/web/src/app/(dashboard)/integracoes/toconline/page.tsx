import { redirect } from "next/navigation";
import Link from "next/link";
import { Building2, ScrollText } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { listTeams } from "@/lib/teams/service";
import { getTeamCredential, getLatestScanJob } from "@/lib/integrations/service";
import { PageHeader } from "@/components/patterns/page-header";
import { AutoRefresh } from "@/components/patterns/auto-refresh";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { TocCredentialForm } from "./TocCredentialForm";
import { ScanPanel } from "./ScanPanel";

export const dynamic = "force-dynamic";

const JOB_LABELS: Record<string, string> = {
  pending: "Na fila",
  running: "A executar",
  succeeded: "Concluída",
  failed: "Falhou",
  skipped: "Ignorada",
  cancelled: "Cancelada",
};

const JOB_TONES: Record<string, BadgeProps["tone"]> = {
  pending: "warning",
  running: "info",
  succeeded: "success",
  failed: "destructive",
  skipped: "neutral",
  cancelled: "neutral",
};

const RESULT_LABELS: [key: string, label: string][] = [
  ["create", "Criadas"],
  ["link", "Associadas"],
  ["update", "Atualizadas"],
  ["unchanged", "Sem alteração"],
  ["skip", "Ignoradas"],
  ["conflict", "Conflitos"],
  ["missing", "Sumiram do TOConline"],
];

interface PageProps {
  searchParams: Promise<{ team?: string }>;
}

export default async function TocOnlinePage({ searchParams }: PageProps) {
  const user = await requireRole("operator");
  if (!user) redirect("/");

  const isAdmin = user.role === "admin";
  const teams = isAdmin ? await listTeams() : [];

  // O admin é global (team_id nulo), portanto escolhe a equipe que está a ver —
  // pela query string, para que o estado da página e o do formulário sejam o
  // mesmo. O operador fica preso à sua.
  const { team: requestedTeam } = await searchParams;
  const teamId = isAdmin
    ? (requestedTeam ?? teams[0]?.id ?? "")
    : (user.teamId ?? "");

  const [credential, job] = await Promise.all([
    getTeamCredential("toconline", teamId),
    getLatestScanJob(teamId),
  ]);

  const connected = credential?.has_secret ?? false;
  const inFlight = job?.status === "pending" || job?.status === "running";
  const result = job?.result ?? null;

  return (
    <div>
      <PageHeader
        title="TOConline"
        description="Liga o gabinete ao TOConline e importa automaticamente a carteira de empresas."
      />

      {/* Enquanto o job corre no worker, a página revalida-se sozinha. */}
      <AutoRefresh active={inFlight} />

      <div className="grid gap-8">
        <TocCredentialForm
          credential={credential}
          teams={teams}
          isAdmin={isAdmin}
          teamId={teamId}
        />

        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Varredura de empresas</CardTitle>
            <CardDescription>
              Lê as empresas do perfil de contabilidade e cadastra-as automaticamente, guardando a
              referência de acesso direto de cada uma.
            </CardDescription>
          </CardHeader>

          <CardContent className="grid gap-6">
            <ScanPanel
              teamId={teamId}
              disabled={!connected}
              disabledReason={
                connected ? undefined : "Configure a ligação ao TOConline antes de varrer."
              }
            />

            <div aria-live="polite" className="grid gap-3">
              {!job ? (
                <p className="text-muted-foreground text-sm">Nenhuma varredura ainda.</p>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <Badge tone={JOB_TONES[job.status] ?? "neutral"}>
                      {JOB_LABELS[job.status] ?? job.status}
                    </Badge>
                    {inFlight && (
                      <span className="text-muted-foreground text-sm">
                        a atualizar automaticamente…
                      </span>
                    )}
                  </div>

                  {job.status === "failed" && job.last_error?.message && (
                    <Alert variant="destructive">
                      <AlertDescription>{job.last_error.message}</AlertDescription>
                    </Alert>
                  )}

                  {job.status === "succeeded" && result && (
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                      {RESULT_LABELS.filter(([key]) => (result[key as keyof typeof result] ?? 0) > 0).map(
                        ([key, label]) => (
                          <div key={key} className="flex justify-between gap-2">
                            <dt className="text-muted-foreground">{label}</dt>
                            <dd className="font-medium">{result[key as keyof typeof result]}</dd>
                          </div>
                        ),
                      )}
                    </dl>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Link
                      href="/empresas"
                      className={buttonVariants({ variant: "ghost", size: "sm" })}
                    >
                      <Building2 aria-hidden /> Ver empresas
                    </Link>
                    {job.trace_id && (
                      <Link
                        href={`/logs/${job.trace_id}`}
                        className={buttonVariants({ variant: "ghost", size: "sm" })}
                      >
                        <ScrollText aria-hidden /> Ver trace
                      </Link>
                    )}
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
