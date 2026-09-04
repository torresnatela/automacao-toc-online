import { and, eq, gte, ne, sql } from "drizzle-orm";
import type { Database } from "@toc/db";
import { schema } from "@toc/db";
import { IVA_DOCUMENT_JOB_TYPE } from "@toc/core/domain";
import type { AttemptGuard } from "../runner/ports";

/**
 * Conta as tentativas que a empresa já gastou hoje contra o Portal das Finanças.
 *
 * Soma `attempts` e não linhas: um job que a fila retentou três vezes gastou
 * três entradas no contador da senha da AT, e é esse contador — não o número de
 * jobs — que bloqueia a conta por dias.
 *
 * O dia é o de **Lisboa**, não o do servidor: o limite existe para não martelar
 * um portal português, e um worker em UTC começaria o dia uma hora antes (duas,
 * no horário de verão) do dia que a AT conta.
 */
export class DbAttemptGuard implements AttemptGuard {
  constructor(private readonly db: Database) {}

  async attemptsToday(teamId: string, companyId: string, excludeJobId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: sql<string>`coalesce(sum(${schema.jobs.attempts}), 0)` })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.type, IVA_DOCUMENT_JOB_TYPE),
          // O `team_id` é redundante — o `company_id` já identifica a linha —
          // mas o worker corre com a service role, sem RLS a segurá-lo
          // (`company-directory.ts:127-130`). Uma leitura que saia da equipa não
          // pode depender de o payload estar correto.
          eq(schema.jobs.teamId, teamId),
          eq(schema.jobs.companyId, companyId),
          // O próprio job não conta para o seu limite: a fila já lhe
          // incrementou a tentativa ao reclamá-lo.
          ne(schema.jobs.id, excludeJobId),
          // `skipped` é o desfecho de quem nunca chegou a autenticar-se
          // (empresa sem NIF, período já guardado): não gastou tentativa nenhuma.
          ne(schema.jobs.status, "skipped"),
          // `started_at` e não `created_at`: o que gasta a tentativa é a
          // execução. Um job enfileirado e nunca começado tem `null` aqui e o
          // `>=` deixa-o de fora, que é exatamente o que se quer.
          gte(
            schema.jobs.startedAt,
            sql`(date_trunc('day', now() at time zone 'Europe/Lisbon') at time zone 'Europe/Lisbon')`,
          ),
        ),
      );

    // `sum()` devolve `numeric`, que o `pg` entrega como string para não perder
    // precisão. Aqui são unidades — o `Number` é seguro.
    return Number(row?.total ?? 0);
  }
}
