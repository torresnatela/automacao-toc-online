import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, ScrollText } from "lucide-react";
import { formatPeriodPt, planBulkFetch, providerForAccess } from "@toc/core/domain";
import { requireRole } from "@/lib/auth";
import { listTeams } from "@/lib/teams/service";
import { getAtAccessMode } from "@/lib/documents/access";
import { listAccessCredentials, listIvaDocuments } from "@/lib/documents/service";
import { credentialForReadiness, summarizeBulkPlan } from "@/lib/documents/bulk";
import {
  credentialBanner,
  credentialLinkFor,
  formatDatePt,
  formatEur,
  isPeakDay,
  presentIvaRow,
} from "@/lib/documents/present";
import { PageHeader } from "@/components/patterns/page-header";
import { AutoRefresh } from "@/components/patterns/auto-refresh";
import { EmptyState } from "@/components/patterns/empty-state";
import { StatusBadge } from "@/components/patterns/status-badge";
import { TeamSwitcher } from "@/components/patterns/team-switcher";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  DataTable,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/patterns/data-table";
import { BatchProgress } from "./BatchProgress";
import { FetchButton } from "./FetchButton";
import { FetchAllButton } from "./FetchAllButton";
import { RowDetailsDialog } from "./RowDetailsDialog";

export const dynamic = "force-dynamic";

/**
 * O «buscar todas» abre um trace por empresa e escreve um job por empresa — 182
 * inserções em blocos de 8. O limite por omissão da Vercel (10 s) cortaria o
 * lote a meio, deixando metade das empresas por enfileirar e nenhum sinal disso
 * na interface. Vale para as ações desta rota (`actions.ts`), que é onde o
 * tempo é gasto.
 */
export const maxDuration = 60;

interface PageProps {
  searchParams: Promise<{ team?: string }>;
}

const TRAVESSAO = "—";

/**
 * A listagem das guias de IVA — o ecrã que o gabinete abre de manhã.
 *
 * Uma linha por empresa (a view já o garante), e em cada uma o estado, os dados
 * de pagamento que a guia trouxe e o que fazer a seguir. Duas regras aguentam o
 * ecrã inteiro:
 *
 * 1. **A página não decide nada.** Se o botão pode buscar, se o lote vale a
 *    pena, o que dizer ao operador — tudo vem de funções puras
 *    (`presentIvaRow`, `planBulkFetch`, `credentialBanner`), e a página só as
 *    pinta. É o que permite testar as decisões sem levantar a aplicação.
 * 2. **A prontidão é a mesma do serviço.** As credenciais entram por empresa
 *    (`credentialForReadiness`), exatamente como em `enqueueIvaFetch`: uma
 *    página que olhasse só para a credencial da equipa diria «pronta» numa
 *    empresa cujo marcador de senha recusada a bloqueia, e o clique seria
 *    recusado logo a seguir.
 */
export default async function GuiasIvaPage({ searchParams }: PageProps) {
  const user = await requireRole("operator");
  if (!user) redirect("/");

  const isAdmin = user.role === "admin";
  const teams = isAdmin ? await listTeams() : [];

  // O admin é global (team_id nulo) e escolhe a equipa pela query string; o
  // operador fica preso à sua. Mesmo padrão de `integracoes/toconline`.
  const { team: requestedTeam } = await searchParams;
  const teamId = isAdmin ? (requestedTeam ?? teams[0]?.id ?? "") : (user.teamId ?? "");

  const access = getAtAccessMode();
  const directAccess = access === "toconline_direct_access";
  const [rows, credentials] = await Promise.all([
    listIvaDocuments(teamId),
    listAccessCredentials(teamId),
  ]);

  // Um `now` só para a página inteira: duas linhas não podem discordar sobre
  // que dia é hoje a meio de uma renderização.
  const now = new Date();
  const items = rows.map((row) => ({
    row,
    view: presentIvaRow(row, {
      access,
      credential: credentialForReadiness(access, row.company_id, credentials.candidates),
      now,
    }),
  }));
  const anyInFlight = items.some((item) => item.view.inFlight);

  // O plano do lote com a MESMA função que o serviço vai correr: se os dois
  // divergissem, o diálogo prometeria 40 empresas e o resumo do fim diria 12.
  const plan = summarizeBulkPlan(
    planBulkFetch(
      items.map(({ row, view }) => ({
        companyId: row.company_id,
        readiness: view.readiness,
        lastOutcome: view.outcome,
        lastFinishedAt: row.job_finished_at,
      })),
      { onlyMissing: true, now },
    ),
  );

  // A credencial do gabinete na rota atual — a que o banner comenta. As por
  // empresa já entraram na prontidão de cada linha, acima.
  const teamCredential = credentials.candidates.find(
    (candidate) =>
      candidate.provider === providerForAccess(access) && candidate.companyId === null,
  );
  const banner = credentials.failed ? null : credentialBanner(access, teamCredential ?? null);

  return (
    <div>
      <PageHeader
        title="Guias de IVA"
        description="Documento de pagamento da declaração periódica de IVA, por empresa."
        actions={
          <>
            {isAdmin && teams.length > 0 && (
              <TeamSwitcher teams={teams} teamId={teamId} basePath="/documentos/iva" />
            )}
            <FetchAllButton teamId={teamId} plan={plan} peak={isPeakDay(now)} />
          </>
        }
      />

      {/* Enquanto houver job na fila ou a correr, a página revalida-se sozinha. */}
      <AutoRefresh active={anyInFlight} intervalMs={5000} />

      {/* Uma leitura falhada das credenciais não pode passar por «não está
          configurada»: mandaria configurar o que já está lá. */}
      {credentials.failed && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>
            Não foi possível ler o estado das credenciais. Recarregue a página; se persistir,
            contacte o suporte.
          </AlertDescription>
        </Alert>
      )}

      {banner && (
        <Alert className="mb-4">
          <AlertDescription>
            {banner.message}{" "}
            <Link href={banner.href} className="font-medium underline underline-offset-2">
              {banner.linkLabel}
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <BatchProgress rows={rows} />

      {items.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="Nenhuma empresa nesta equipa"
          description="Importe a carteira em Integrações → TOConline ou cadastre empresas em Empresas."
          action={
            <Link href="/empresas" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Ver empresas
            </Link>
          }
        />
      ) : (
        <DataTable>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>Período</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Entidade</TableHead>
              <TableHead>Referência</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Prazo</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map(({ row, view }) => {
              // O período da obrigação manda; o do job serve as empresas que
              // ainda não têm período nenhum (a primeira busca é que o cria).
              const period = row.period ?? row.job_period;
              const periodLabel = period === null ? TRAVESSAO : formatPeriodPt(period);
              const fetchProps = {
                companyId: row.company_id,
                teamId,
                canFetch: view.canFetch,
                ...(view.disabledReason === undefined
                  ? {}
                  : { disabledReason: view.disabledReason }),
                fetchLabel: view.fetchLabel,
              };
              const credentialLink = credentialLinkFor(view.outcome, access);

              return (
                <TableRow key={row.company_id}>
                  <TableCell>
                    <div className="font-medium text-foreground">{row.company_name}</div>
                    <div className="text-muted-foreground text-xs tabular-nums">
                      {row.nif ?? TRAVESSAO}
                    </div>
                    {/* Só na rota A: é lá que a ligação ao TOConline é o que
                        identifica a empresa no portal. Na rota B a empresa
                        sem ligação busca-se na mesma, pelo NIF. */}
                    {directAccess && row.toconline_company_id === null && (
                      <Badge tone="neutral" className="mt-1">
                        Sem ligação TOConline
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{periodLabel}</TableCell>
                  <TableCell>
                    <StatusBadge kind="ivaDocument" value={view.state} label={view.label} />
                    <p className="text-muted-foreground text-xs">{view.short}</p>
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {row.entity ?? TRAVESSAO}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {row.reference ?? TRAVESSAO}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatEur(row.amount)}
                  </TableCell>
                  <TableCell className="tabular-nums">{formatDatePt(row.due_date)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap items-start justify-end gap-2">
                      <FetchButton {...fetchProps} />

                      {/* O href aponta para a rota, nunca para o storage: a signed
                          URL só existe dentro do 302 e nunca chega ao HTML. Sem
                          JavaScript pelo meio — é um link. */}
                      {row.has_file && row.document_id && (
                        <Link
                          href={`/api/documents/${row.document_id}/download`}
                          target="_blank"
                          rel="noopener"
                          className={buttonVariants({ variant: "ghost", size: "sm" })}
                        >
                          <FileText aria-hidden /> PDF
                        </Link>
                      )}

                      <RowDetailsDialog
                        companyName={row.company_name}
                        periodLabel={periodLabel}
                        state={view.state}
                        stateLabel={view.label}
                        guidance={view.guidance}
                        {...(row.job_error === null ? {} : { jobError: row.job_error })}
                        {...(row.job_id === null
                          ? {}
                          : {
                              job: {
                                attempts: row.job_attempts ?? 0,
                                finishedAt: formatDatePt(row.job_finished_at),
                              },
                            })}
                        {...(row.document_id === null
                          ? {}
                          : {
                              payment: {
                                entity: row.entity ?? TRAVESSAO,
                                reference: row.reference ?? TRAVESSAO,
                                amount: formatEur(row.amount),
                                dueDate: formatDatePt(row.due_date),
                              },
                            })}
                        {...(row.job_trace_id === null
                          ? {}
                          : { traceHref: `/logs/${row.job_trace_id}` })}
                        companyHref={`/empresas/${row.company_id}`}
                        {...(credentialLink === null ? {} : { credentialLink })}
                        fetch={fetchProps}
                      />

                      {row.job_trace_id && (
                        <Link
                          href={`/logs/${row.job_trace_id}`}
                          className={buttonVariants({ variant: "ghost", size: "sm" })}
                        >
                          <ScrollText aria-hidden /> Ver trace
                        </Link>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </DataTable>
      )}
    </div>
  );
}
