import { and, eq, sql, type SQL } from "drizzle-orm";
import type { Database } from "@toc/db";
import { schema } from "@toc/db";
import { IVA_DOCUMENT_TYPE, IVA_OBLIGATION_KIND } from "@toc/core/domain";
import { StructuralError } from "../errors";
import type { AtCompanyHandle, ObligationLedger, PeriodState } from "../runner/ports";

/**
 * O livro-razão do IVA: empresa → obrigação → período → documento.
 *
 * Não decide nada — o runner é que sabe o que aconteceu no portal. Aqui só se
 * escreve, e escreve-se de forma a que correr o mesmo job duas vezes deixe a
 * base de dados igual: cada passo é um `on conflict do update` sobre a
 * identidade natural da linha (`obligation_company_kind_uq`,
 * `obligation_period_uq`, `document_period_type_uq`), nunca um select-then-insert
 * que, corrido em paralelo consigo mesmo, duplicaria a obrigação.
 *
 * **Predicado de equipa em toda a escrita.** O worker corre com a service role
 * e nenhuma policy o trava (ver `company-directory.ts:127-130`): o `team_id` do
 * payload é confirmado contra a base — na transação, subindo período →
 * obrigação → empresa — antes de qualquer linha mudar. Um id trocado num
 * payload dá erro ou zero linhas, nunca uma guia escrita no gabinete errado.
 */
export class DbObligationLedger implements ObligationLedger {
  constructor(private readonly db: Database) {}

  async getCompany(
    teamId: string,
    companyId: string,
  ): Promise<(AtCompanyHandle & { status: string }) | null> {
    const [row] = await this.db
      .select({
        id: schema.companies.id,
        nif: schema.companies.nif,
        tocCompanyId: schema.companies.toconlineCompanyId,
        tocCluster: schema.companies.toconlineCluster,
        status: schema.companies.status,
      })
      .from(schema.companies)
      .where(and(eq(schema.companies.id, companyId), eq(schema.companies.teamId, teamId)))
      .limit(1);

    return row ?? null;
  }

  async getPeriod(teamId: string, companyId: string, period: string): Promise<PeriodState | null> {
    const [row] = await this.db
      .select({
        periodId: schema.obligationPeriods.id,
        status: schema.obligationPeriods.status,
        documentId: schema.documents.id,
        storagePath: schema.documents.storagePath,
      })
      .from(schema.obligationPeriods)
      .innerJoin(
        schema.obligations,
        eq(schema.obligations.id, schema.obligationPeriods.obligationId),
      )
      .innerJoin(schema.companies, eq(schema.companies.id, schema.obligations.companyId))
      // `left join`: o período existe antes do documento (é aberto como
      // `in_progress` antes de se ir ao portal), e é essa diferença que o runner
      // lê como "já fomos buscar" vs. "está por buscar".
      .leftJoin(
        schema.documents,
        and(
          eq(schema.documents.obligationPeriodId, schema.obligationPeriods.id),
          eq(schema.documents.type, IVA_DOCUMENT_TYPE),
        ),
      )
      .where(
        and(
          eq(schema.companies.id, companyId),
          eq(schema.companies.teamId, teamId),
          eq(schema.obligations.kind, IVA_OBLIGATION_KIND),
          eq(schema.obligationPeriods.period, period),
        ),
      )
      .limit(1);

    if (!row) return null;
    return {
      periodId: row.periodId,
      status: row.status,
      documentId: row.documentId,
      // `hasFile` e não o caminho: quem chama decide pela existência do ficheiro,
      // e o caminho não tem por que circular.
      hasFile: row.storagePath !== null,
    };
  }

  async beginPeriod(
    teamId: string,
    companyId: string,
    period: string,
    dueDate: string | null,
    frequency: "monthly" | "quarterly",
  ): Promise<{ periodId: string }> {
    // Transação: a obrigação e o período nascem juntos ou não nascem. Uma
    // obrigação sem período seria uma linha órfã que nada voltaria a tocar.
    return this.db.transaction(async (tx) => {
      const [company] = await tx
        .select({ id: schema.companies.id })
        .from(schema.companies)
        .where(and(eq(schema.companies.id, companyId), eq(schema.companies.teamId, teamId)))
        .limit(1);
      // Estrutural e não transitório: um payload a apontar uma empresa de outra
      // equipa não fica certo à terceira tentativa.
      if (!company) throw new StructuralError("Empresa não encontrada nesta equipa.");

      const [obligation] = await tx
        .insert(schema.obligations)
        .values({ companyId, kind: IVA_OBLIGATION_KIND, frequency })
        .onConflictDoUpdate({
          target: [schema.obligations.companyId, schema.obligations.kind],
          // Só o carimbo: a frequência já registada é a que um humano ou uma
          // leitura anterior fixou, e o portal não é fonte melhor do que ela.
          // O `do update` existe para o `returning` trazer sempre a linha.
          set: { updatedAt: sql`now()` },
        })
        .returning({ id: schema.obligations.id });

      const [row] = await tx
        .insert(schema.obligationPeriods)
        .values({ obligationId: obligation!.id, period, status: "in_progress", dueDate })
        .onConflictDoUpdate({
          target: [schema.obligationPeriods.obligationId, schema.obligationPeriods.period],
          set: {
            // Abrir o período outra vez não pode desfazer o que ele já é: uma
            // guia guardada (`delivered`) ou paga (`paid`) sobrevive a uma nova
            // passagem do worker.
            status: sql`case
              when ${schema.obligationPeriods.status} in ('delivered','paid')
                then ${schema.obligationPeriods.status}
              else 'in_progress'
            end`,
            // `coalesce` e nesta ordem: um prazo derivado agora preenche o que
            // faltava, mas um `null` de agora não apaga o que já lá estava.
            dueDate: sql`coalesce(excluded.due_date, ${schema.obligationPeriods.dueDate})`,
            updatedAt: sql`now()`,
          },
        })
        .returning({ id: schema.obligationPeriods.id });

      return { periodId: row!.id };
    });
  }

  async recordDocument(
    teamId: string,
    periodId: string,
    doc: {
      type: string;
      entity: string | null;
      reference: string | null;
      amount: string | null;
      validUntil: string | null;
      storagePath: string;
      extractedAt: Date;
      metadata: Record<string, unknown>;
    },
  ): Promise<{ documentId: string }> {
    // Transação: o documento e o estado do período contam a mesma coisa. Gravar
    // a guia e deixar o período por marcar poria o dashboard a dizer "por
    // buscar" sobre um PDF que já está no Storage.
    return this.db.transaction(async (tx) => {
      const [pertence] = await tx
        .select({ id: schema.obligationPeriods.id })
        .from(schema.obligationPeriods)
        .innerJoin(
          schema.obligations,
          eq(schema.obligations.id, schema.obligationPeriods.obligationId),
        )
        .innerJoin(schema.companies, eq(schema.companies.id, schema.obligations.companyId))
        .where(
          and(eq(schema.obligationPeriods.id, periodId), eq(schema.companies.teamId, teamId)),
        )
        .limit(1);
      if (!pertence) throw new StructuralError("Período não encontrado nesta equipa.");

      const [document] = await tx
        .insert(schema.documents)
        .values({
          obligationPeriodId: periodId,
          type: doc.type,
          entity: doc.entity,
          reference: doc.reference,
          amount: doc.amount,
          validUntil: doc.validUntil,
          storagePath: doc.storagePath,
          status: "extracted",
          extractedAt: doc.extractedAt,
          metadata: doc.metadata,
        })
        .onConflictDoUpdate({
          target: [schema.documents.obligationPeriodId, schema.documents.type],
          set: {
            entity: sql`excluded.entity`,
            reference: sql`excluded.reference`,
            amount: sql`excluded.amount`,
            validUntil: sql`excluded.valid_until`,
            // O caminho é a chave de idempotência do período: a segunda captura
            // sobrescreveu o mesmo objeto no Storage.
            storagePath: sql`excluded.storage_path`,
            status: "extracted",
            extractedAt: sql`excluded.extracted_at`,
            // Mescla e não substituição: o que o dashboard escreveu no metadata
            // não pode ser apagado por uma segunda ida ao portal.
            metadata: sql`${schema.documents.metadata} || excluded.metadata`,
            updatedAt: sql`now()`,
          },
        })
        .returning({ id: schema.documents.id });

      await tx
        .update(schema.obligationPeriods)
        .set({ status: "delivered", updatedAt: sql`now()` })
        // Predicado de equipa outra vez, já dentro da transação que o verificou:
        // é a última barreira antes da escrita, e não custa nada.
        .where(and(eq(schema.obligationPeriods.id, periodId), daEquipa(teamId)));

      return { documentId: document!.id };
    });
  }

  async markPeriod(
    teamId: string,
    periodId: string,
    status: "skipped_nonexistent" | "paid" | "pending" | "error",
  ): Promise<void> {
    await this.db
      .update(schema.obligationPeriods)
      .set({
        // `error` NUNCA regride um período entregue ou pago. Uma falha a seguir
        // a uma guia guardada (o browser a fechar mal, o trace a falhar) não
        // pode apagar do dashboard o facto de a guia existir. O runner chama
        // isto do `catch` sem saber em que ponto ficou — a regra vive aqui,
        // onde o estado anterior é visível na própria instrução.
        status: sql`case
          when ${status}::text = 'error'
            and ${schema.obligationPeriods.status} in ('delivered','paid')
            then ${schema.obligationPeriods.status}
          else ${status}::obligation_period_status
        end`,
        updatedAt: sql`now()`,
      })
      .where(and(eq(schema.obligationPeriods.id, periodId), daEquipa(teamId)));
  }
}

/**
 * "Este período é mesmo desta equipa?" — sobe período → obrigação → empresa.
 *
 * Correlacionado com a linha a ser atualizada, portanto uma escrita fora da
 * equipa não dá erro: dá **zero linhas**. É o comportamento certo para um sink
 * que não decide nada e que o runner chama em fail-open a partir do `catch`.
 */
function daEquipa(teamId: string): SQL {
  return sql`exists (
    select 1
    from ${schema.obligations} o
    join ${schema.companies} c on c.id = o.company_id
    where o.id = ${schema.obligationPeriods.obligationId} and c.team_id = ${teamId}
  )`;
}
