import { redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { providerForAccess } from "@toc/core/domain";
import { requireRole } from "@/lib/auth";
import { listTeams } from "@/lib/teams/service";
import { getTeamCredential } from "@/lib/integrations/service";
import { getAtAccessMode } from "@/lib/documents/access";
import { listIvaDocuments } from "@/lib/documents/service";
import { presentIvaRow } from "@/lib/documents/present";
import { PageHeader } from "@/components/patterns/page-header";
import { AutoRefresh } from "@/components/patterns/auto-refresh";
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
import { FetchButton } from "./FetchButton";
import { FetchAllButton } from "./FetchAllButton";

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

/**
 * Listagem mínima das guias de IVA — o suficiente para enfileirar e acompanhar.
 *
 * A versão completa (valores, prazos, descarregar o PDF, filtros) é a Task 14.
 * O que já está aqui e não muda: a decisão de o botão poder ou não buscar vem
 * toda de `presentIvaRow`, e a página só a pinta.
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
  const [rows, credential] = await Promise.all([
    listIvaDocuments(teamId),
    getTeamCredential(providerForAccess(access), teamId),
  ]);

  // Um `now` só para a página inteira: duas linhas não podem discordar sobre
  // que dia é hoje a meio de uma renderização.
  const now = new Date();
  const cred =
    credential === null ? null : { hasSecret: credential.has_secret, status: credential.status };
  const items = rows.map((row) => ({
    row,
    view: presentIvaRow(row, { access, credential: cred, now }),
  }));
  const anyInFlight = items.some((item) => item.view.inFlight);

  return (
    <div>
      <PageHeader
        title="Guias de IVA"
        description="Documento de pagamento da declaração periódica de IVA, por empresa."
        actions={<FetchAllButton teamId={teamId} disabled={items.length === 0} />}
      />

      {/* Enquanto houver job na fila ou a correr, a página revalida-se sozinha. */}
      <AutoRefresh active={anyInFlight} intervalMs={5000} />

      {items.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="Nenhuma empresa nesta equipa"
          description="Cadastre empresas ou corra a varredura do TOConline para as importar."
        />
      ) : (
        <DataTable>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>Período</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map(({ row, view }) => (
              <TableRow key={row.company_id}>
                <TableCell>
                  <div className="font-medium text-foreground">{row.company_name}</div>
                  <div className="text-muted-foreground text-xs tabular-nums">{row.nif ?? "—"}</div>
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  {row.period ?? "—"}
                </TableCell>
                <TableCell>
                  <StatusBadge kind="ivaDocument" value={view.state} label={view.label} />
                  <p className="text-muted-foreground text-xs">{view.short}</p>
                </TableCell>
                <TableCell className="text-right">
                  <FetchButton
                    companyId={row.company_id}
                    teamId={teamId}
                    canFetch={view.canFetch}
                    disabledReason={view.disabledReason}
                    fetchLabel={view.fetchLabel}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </DataTable>
      )}
    </div>
  );
}
