import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@toc/db";
import { schema } from "@toc/db";
import type { ExistingCompany, ReconcileAction, ReconcilePlan, ScannedCompany } from "@toc/core/domain";
import type { CompanyDirectory, UpsertReport } from "../runner/ports";

/**
 * Executa um plano de reconciliação contra a tabela `companies`.
 *
 * Não decide nada: o plano já traz a decisão por empresa (criar, associar,
 * atualizar, ignorar, conflito, desaparecida). Aqui só se escreve — e é essa
 * separação que permite cobrir as regras com testes puros e deixar a este
 * ficheiro apenas o que exige base de dados.
 */

/**
 * Lotes para o que partilha valores (inserções, e os carimbos de
 * `unchanged`/`missing`). Os `link`/`update` ficam de fora por natureza: cada um
 * escreve colunas diferentes, e agrupá-los exigiria um `CASE` por coluna ou um
 * `unnest` — mais máquina do que o problema justifica para a dezena de linhas
 * que mudam numa varredura típica.
 */
const BATCH = 25;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Metadados não-essenciais do fornecedor, guardados sob a chave `toconline`. */
function tocMetadata(entry: ScannedCompany, now: Date) {
  return {
    toconline: {
      cluster: entry.cluster,
      roles: entry.roles,
      demo: entry.demo,
      modules: { accounting: entry.accounting },
      scannedAt: now.toISOString(),
    },
  };
}

export class DbCompanyDirectory implements CompanyDirectory {
  constructor(private readonly db: Database) {}

  async list(teamId: string): Promise<ExistingCompany[]> {
    const rows = await this.db
      .select({
        id: schema.companies.id,
        nif: schema.companies.nif,
        name: schema.companies.name,
        status: schema.companies.status,
        tocCompanyId: schema.companies.toconlineCompanyId,
        tocCluster: schema.companies.toconlineCluster,
      })
      .from(schema.companies)
      .where(eq(schema.companies.teamId, teamId));

    return rows.map((r) => ({
      id: r.id,
      nif: r.nif,
      name: r.name,
      status: r.status,
      tocCompanyId: r.tocCompanyId,
      tocCluster: r.tocCluster,
    }));
  }

  async apply(teamId: string, plan: ReconcilePlan): Promise<UpsertReport> {
    const now = new Date();
    const report: UpsertReport = {
      created: 0,
      linked: 0,
      updated: 0,
      unchanged: 0,
      missing: 0,
      conflicts: 0,
    };

    const creates = plan.actions.filter((a) => a.kind === "create");
    const writes = plan.actions.filter((a) => a.kind === "link" || a.kind === "update");
    const unchanged = plan.actions.filter((a) => a.kind === "unchanged");
    const missing = plan.actions.filter((a) => a.kind === "missing");

    for (const batch of chunk(creates, BATCH)) {
      await this.db.insert(schema.companies).values(
        batch.map((a) => {
          const entry = (a as Extract<ReconcileAction, { kind: "create" }>).entry;
          return {
            teamId,
            // NISS e tipo ficam nulos: o TOConline não os fornece, e inventá-los
            // faria um dado adivinhado parecer verificado.
            nif: entry.nif,
            name: entry.name,
            status: entry.active ? ("active" as const) : ("inactive" as const),
            toconlineCompanyId: entry.tocCompanyId,
            toconlineCluster: entry.cluster,
            toconlineSyncedAt: now,
            metadata: tocMetadata(entry, now),
          };
        }),
      );
      report.created += batch.length;
    }

    for (const action of writes) {
      const a = action as Extract<ReconcileAction, { kind: "link" | "update" }>;
      await this.db
        .update(schema.companies)
        .set({
          ...(a.changes.name !== undefined ? { name: a.changes.name } : {}),
          ...(a.changes.nif !== undefined ? { nif: a.changes.nif } : {}),
          ...(a.changes.status !== undefined ? { status: a.changes.status } : {}),
          ...(a.changes.tocCompanyId !== undefined
            ? { toconlineCompanyId: a.changes.tocCompanyId }
            : {}),
          ...(a.changes.tocCluster !== undefined
            ? { toconlineCluster: a.changes.tocCluster }
            : {}),
          toconlineSyncedAt: now,
          // Merge e não substituição: a varredura não pode apagar o que o
          // dashboard escreveu no metadata.
          metadata: sql`${schema.companies.metadata} || ${JSON.stringify(tocMetadata(a.entry, now))}::jsonb`,
          updatedAt: now,
        })
        // O `teamId` é redundante — estes ids vieram do `list(teamId)` — mas o
        // worker corre com a service role, sem RLS a segurá-lo. Uma escrita que
        // saia da equipa não pode depender de o plano estar correto.
        .where(and(eq(schema.companies.id, a.companyId), eq(schema.companies.teamId, teamId)));

      if (a.kind === "link") report.linked += 1;
      else report.updated += 1;
    }

    // "Sem alteração" ainda carimba o "visto agora": é o que distingue uma
    // empresa estável de uma que desapareceu do TOConline.
    const unchangedIds = unchanged.map(
      (a) => (a as Extract<ReconcileAction, { kind: "unchanged" }>).companyId,
    );
    for (const batch of chunk(unchangedIds, BATCH)) {
      await this.db
        .update(schema.companies)
        .set({ toconlineSyncedAt: now })
        .where(and(inArray(schema.companies.id, batch), eq(schema.companies.teamId, teamId)));
    }
    report.unchanged = unchangedIds.length;

    // Desaparecidas: só se marca, nunca se apaga nem se desativa. `companies`
    // cascateia para obligations → obligation_periods → documents, e sumir do
    // portal do fornecedor não pode apagar histórico fiscal nosso.
    const missingIds = missing.map(
      (a) => (a as Extract<ReconcileAction, { kind: "missing" }>).companyId,
    );
    for (const batch of chunk(missingIds, BATCH)) {
      await this.db
        .update(schema.companies)
        .set({
          metadata: sql`${schema.companies.metadata} || ${JSON.stringify({
            toconline: { missingSince: now.toISOString() },
          })}::jsonb`,
          updatedAt: now,
        })
        .where(
          and(inArray(schema.companies.id, batch), eq(schema.companies.teamId, teamId)),
        );
    }
    report.missing = missingIds.length;
    report.conflicts = plan.summary.conflict;

    return report;
  }
}
