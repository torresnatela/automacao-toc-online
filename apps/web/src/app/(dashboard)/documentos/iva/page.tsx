import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, ScrollText } from "lucide-react";
import {
  AT_ACCESS_MODES,
  formatPeriodPt,
  planBulkFetch,
  providerForAccess,
  type AtAccessMode,
} from "@toc/core/domain";
import { requireRole } from "@/lib/auth";
import { listTeams } from "@/lib/teams/service";
import { listAccessCredentials, listIvaDocuments } from "@/lib/documents/service";
import {
  credentialForReadiness,
  summarizeBulkPlan,
  type BulkPlanSummary,
} from "@/lib/documents/bulk";
import {
  accessHint,
  credentialBanner,
  credentialLinkFor,
  fetchAffordances,
  formatDatePt,
  formatEur,
  isPeakDay,
  jobErrorFor,
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
import { FetchButton, type FetchButtonProps } from "./FetchButton";
import { SendButton } from "./SendButton";
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
 * 2. **A prontidão é a mesma do serviço, por rota.** As credenciais entram por
 *    empresa e por rota (`credentialForReadiness`), exatamente como em
 *    `enqueueIvaFetch`: uma página que olhasse só para a credencial da equipa
 *    diria «pronta» numa empresa cujo marcador de senha recusada a bloqueia, e
 *    o clique seria recusado logo a seguir.
 *
 * A rota não é uma configuração da página: cada linha tem um botão por rota
 * («Buscar» = login direto na AT, «Buscar via TOConline» = Acesso Direto) e o
 * operador escolhe a cada clique. A listagem diz ao lado do estado por que rota
 * correu a última tentativa, para as duas se poderem comparar.
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

  const [rows, credentials] = await Promise.all([
    listIvaDocuments(teamId),
    listAccessCredentials(teamId),
  ]);

  // Um `now` só para a página inteira: duas linhas não podem discordar sobre
  // que dia é hoje a meio de uma renderização.
  const now = new Date();
  const items = rows.map((row) => ({
    row,
    view: presentIvaRow(row),
    // A decisão de cada rota para esta linha, com a credencial de cada uma.
    affordances: fetchAffordances(row, (access) =>
      credentialForReadiness(access, row.company_id, credentials.candidates),
    ),
  }));
  const anyInFlight = items.some((item) => item.view.inFlight);

  // O plano de cada lote com a MESMA função que o serviço vai correr: se os
  // dois divergissem, o diálogo prometeria 40 empresas e o resumo do fim diria
  // 12. Um plano por rota, porque a prontidão é por rota.
  const planFor = (access: AtAccessMode): BulkPlanSummary =>
    summarizeBulkPlan(
      planBulkFetch(
        items.map(({ row, view, affordances }) => ({
          companyId: row.company_id,
          readiness: affordances[access].readiness,
          lastOutcome: view.outcome,
          lastFinishedAt: row.job_finished_at,
        })),
        { onlyMissing: true, now },
      ),
    );
  const plans: Record<AtAccessMode, BulkPlanSummary> = {
    at_direct_login: planFor("at_direct_login"),
    toconline_direct_access: planFor("toconline_direct_access"),
  };

  // A credencial do gabinete de cada rota — a que o banner dessa rota comenta.
  // As por empresa já entraram na prontidão de cada linha, acima. Com duas
  // rotas na mesma listagem pode haver um banner por rota.
  const teamCredentialFor = (access: AtAccessMode) =>
    credentials.candidates.find(
      (candidate) =>
        candidate.provider === providerForAccess(access) && candidate.companyId === null,
    ) ?? null;
  const banners = credentials.failed
    ? []
    : AT_ACCESS_MODES.flatMap((access) => {
        const banner = credentialBanner(access, teamCredentialFor(access));
        return banner === null ? [] : [banner];
      });

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
            <FetchAllButton
              teamId={teamId}
              access="toconline_direct_access"
              plan={plans.toconline_direct_access}
              peak={isPeakDay(now)}
            />
            <FetchAllButton
              teamId={teamId}
              access="at_direct_login"
              plan={plans.at_direct_login}
              peak={isPeakDay(now)}
            />
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

      {banners.map((banner) => (
        <Alert key={banner.href} className="mb-4">
          <AlertDescription>
            {banner.message}{" "}
            <Link href={banner.href} className="font-medium underline underline-offset-2">
              {banner.linkLabel}
            </Link>
          </AlertDescription>
        </Alert>
      ))}

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
            {items.map(({ row, view, affordances }) => {
              // O período da obrigação manda; o do job serve as empresas que
              // ainda não têm período nenhum (a primeira busca é que o cria).
              const period = row.period ?? row.job_period;
              const periodLabel = period === null ? TRAVESSAO : formatPeriodPt(period);
              // Só o erro que a linha está mesmo a dizer: `last_error` fica na
              // linha do job depois de um adiamento, e mostrá-lo por baixo de um
              // selo verde é pior do que não mostrar nada.
              const jobError = jobErrorFor(row);
              // Um botão por rota, cada um com a decisão da sua rota.
              const fetch: Record<AtAccessMode, FetchButtonProps> = {
                at_direct_login: {
                  companyId: row.company_id,
                  teamId,
                  ...affordances.at_direct_login,
                },
                toconline_direct_access: {
                  companyId: row.company_id,
                  teamId,
                  ...affordances.toconline_direct_access,
                  variant: "ghost",
                },
              };
              // O link da credencial aponta para a rota que CORREU: foi ela que
              // produziu o desfecho, e é lá que está a senha que o produziu.
              const credentialLink = credentialLinkFor(view.outcome, view.lastAccess);
              const hint = accessHint(view.lastAccess);

              return (
                <TableRow key={row.company_id}>
                  <TableCell>
                    <div className="font-medium text-foreground">{row.company_name}</div>
                    <div className="text-muted-foreground text-xs tabular-nums">
                      {row.nif ?? TRAVESSAO}
                    </div>
                    {/* É o que explica um «Buscar via TOConline» desligado: sem
                        ligação, a rota A não tem como vestir a empresa. A rota B
                        busca-a na mesma, pelo NIF. */}
                    {row.toconline_company_id === null && (
                      <Badge tone="neutral" className="mt-1">
                        Sem ligação TOConline
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{periodLabel}</TableCell>
                  <TableCell>
                    <StatusBadge kind="ivaDocument" value={view.state} label={view.label} />
                    {/* A rota da última tentativa ao lado do estado: é o que
                        permite comparar as duas estratégias na mesma listagem. */}
                    <p className="text-muted-foreground text-xs">
                      {view.short}
                      {hint === null ? "" : ` · ${hint}`}
                    </p>
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {row.entity ?? TRAVESSAO}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {row.reference ?? TRAVESSAO}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatEur(row.amount)}</TableCell>
                  <TableCell className="tabular-nums">{formatDatePt(row.due_date)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap items-start justify-end gap-2">
                      {/* Empilhados para a célula não alargar: a rota B em cima
                          (a de sempre), a A por baixo. */}
                      <div className="flex flex-col items-end gap-1">
                        <FetchButton {...fetch.at_direct_login} />
                        <FetchButton {...fetch.toconline_direct_access} />
                      </div>

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

                      {/* «Enviar ao cliente» (mock do envio por email) só quando
                          há guia capturada; some quando já foi enviada. */}
                      {row.document_id && (view.canSend || view.sent) && (
                        <SendButton
                          documentId={row.document_id}
                          teamId={teamId}
                          canSend={view.canSend}
                          sent={view.sent}
                        />
                      )}

                      <RowDetailsDialog
                        companyName={row.company_name}
                        periodLabel={periodLabel}
                        state={view.state}
                        stateLabel={view.label}
                        guidance={view.guidance}
                        {...(jobError === null ? {} : { jobError })}
                        {...(row.job_id === null
                          ? {}
                          : {
                              job: {
                                attempts: row.job_attempts ?? 0,
                                // Só quando terminou: um job na fila não tem
                                // data de fim, e o travessão fingiria que sim.
                                ...(row.job_finished_at === null
                                  ? {}
                                  : { finishedAt: formatDatePt(row.job_finished_at) }),
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
                        {...(hint === null ? {} : { lastAccess: hint })}
                        fetch={fetch}
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
