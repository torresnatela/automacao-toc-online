import { and, eq, isNull, or, sql } from "drizzle-orm";
import type { Database } from "@toc/db";
import { schema } from "@toc/db";
import { decryptSecret } from "@toc/core/crypto";
import type { IntegrationProvider } from "@toc/core/domain";
import type { AtCredentialSource, CredentialLookup } from "../runner/ports";

/**
 * Resolve a credencial de um portal a partir de `integration_credentials`.
 *
 * É o único ponto do worker onde o segredo volta a ser texto claro — e ele
 * nunca sai daqui a não ser dentro do objeto de credenciais entregue à sessão.
 * Nenhum erro desta classe inclui o segredo: quando a decifra falha, o que se
 * devolve é um motivo, não um valor.
 */
export class DbCredentialSource implements AtCredentialSource {
  constructor(
    private readonly db: Database,
    /** Explícita para testar sem depender do ambiente. */
    private readonly encryptionKey?: string,
  ) {}

  async load(credentialId: string): Promise<CredentialLookup> {
    const [row] = await this.db
      .select({
        username: schema.integrationCredentials.username,
        secret: schema.integrationCredentials.secretEncrypted,
        status: schema.integrationCredentials.status,
        // O `provider` e o âmbito vêm com a credencial porque quem a pede tem
        // só o `credentialId` do payload: é assim que o runner confirma que a
        // credencial é a que a rota consome, e a quem ela pertence.
        provider: schema.integrationCredentials.provider,
        teamId: schema.integrationCredentials.teamId,
        companyId: schema.integrationCredentials.companyId,
      })
      .from(schema.integrationCredentials)
      .where(eq(schema.integrationCredentials.id, credentialId))
      .limit(1);

    if (!row || !row.username || !row.secret) return { ok: false, reason: "not_found" };
    if (row.status === "invalid") return { ok: false, reason: "invalid" };
    if (row.status === "expired") return { ok: false, reason: "expired" };

    try {
      const password = decryptSecret(row.secret, this.encryptionKey);
      return {
        ok: true,
        credentials: { username: row.username, password },
        provider: row.provider,
        scope: { teamId: row.teamId, companyId: row.companyId },
      };
    } catch {
      // Chave trocada ou registo corrompido. Marca-se inválida para os jobs
      // seguintes nem chegarem ao browser, e o dashboard pedir reconfiguração.
      // Não se apaga a linha: perder-se-ia o utilizador e o rasto de auditoria.
      await this.markInvalid(credentialId, "decrypt_failed");
      return { ok: false, reason: "invalid" };
    }
  }

  async markVerified(credentialId: string): Promise<void> {
    await this.db
      .update(schema.integrationCredentials)
      .set({
        status: "active",
        lastVerifiedAt: new Date(),
        // A marca de inválida sai com a verificação. Sem isto, uma credencial
        // corrigida ficaria `active` a exibir no dashboard o motivo pelo qual
        // *deixou* de o ser — e o operador leria uma senha boa como partida.
        metadata: sql`${schema.integrationCredentials.metadata} - 'invalidReason' - 'invalidAt' - 'attemptsLeft'`,
        updatedAt: new Date(),
      })
      .where(eq(schema.integrationCredentials.id, credentialId));
  }

  async markInvalid(credentialId: string, reason: string): Promise<void> {
    await this.db
      .update(schema.integrationCredentials)
      .set({
        status: "invalid",
        // O motivo é um código nosso, nunca a mensagem crua de uma biblioteca.
        metadata: { invalidReason: reason, invalidAt: new Date().toISOString() },
        updatedAt: new Date(),
      })
      .where(eq(schema.integrationCredentials.id, credentialId));
  }

  /**
   * A credencial que serve esta empresa, por precedência: a **dela** primeiro,
   * a do gabinete a seguir.
   *
   * `order by company_id nulls last` faz a precedência em SQL em vez de duas
   * consultas: em Postgres o `asc` põe os nulos no fim, logo a linha da empresa
   * — se existir — é sempre a primeira.
   */
  async findFor(input: {
    teamId: string;
    companyId: string;
    provider: IntegrationProvider;
  }): Promise<{ credentialId: string } | null> {
    const [row] = await this.db
      .select({ id: schema.integrationCredentials.id })
      .from(schema.integrationCredentials)
      .where(
        and(
          // O `team_id` não é redundante aqui: é ele que impede a credencial de
          // um gabinete de ser encontrada pelo id de uma empresa de outro.
          eq(schema.integrationCredentials.teamId, input.teamId),
          eq(schema.integrationCredentials.provider, input.provider),
          or(
            eq(schema.integrationCredentials.companyId, input.companyId),
            isNull(schema.integrationCredentials.companyId),
          ),
        ),
      )
      .orderBy(sql`${schema.integrationCredentials.companyId} nulls last`)
      .limit(1);

    return row ? { credentialId: row.id } : null;
  }

  /**
   * A senha caducou — não está errada.
   *
   * Estado próprio e não `invalid` porque o que o operador tem de fazer é
   * diferente: renovar, não corrigir. O `||` mescla em vez de substituir, para
   * o motivo não apagar o que o dashboard escreveu no metadata (o host
   * shardado, por exemplo).
   */
  async markExpired(credentialId: string, reason: string): Promise<void> {
    await this.db
      .update(schema.integrationCredentials)
      .set({
        status: "expired",
        // O motivo é um código nosso, nunca a mensagem crua do portal.
        metadata: sql`${schema.integrationCredentials.metadata} || ${JSON.stringify({
          invalidReason: reason,
          invalidAt: new Date().toISOString(),
        })}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(schema.integrationCredentials.id, credentialId));
  }

  /**
   * Rota A (Acesso Direto): a AT recusou a senha da **empresa**, que vive no
   * TOConline e não nesta tabela.
   *
   * O que se escreve é uma **linha-marcador** `at`/empresa — sem `username`,
   * sem `secret_encrypted` — só para o dashboard poder dizer de quem é o
   * problema. Marcar a credencial do TOConline seria o erro caro: ela está boa,
   * e invalidá-la pararia as 182 empresas por causa de uma.
   *
   * `on conflict` sobre o unique parcial `credential_company_provider_uq`: a
   * linha cria-se na primeira recusa e atualiza-se nas seguintes, sem um
   * select-then-insert que dois jobs em paralelo duplicariam.
   */
  async markCompanyAtInvalid(input: {
    teamId: string;
    companyId: string;
    reason: string;
    attemptsLeft?: number;
  }): Promise<void> {
    const marca = {
      // De onde veio a senha que a AT recusou — é o que distingue esta linha de
      // uma credencial `at` que o gabinete tenha configurado à mão.
      source: "toconline_direct_access",
      invalidReason: input.reason,
      invalidAt: new Date().toISOString(),
      ...(input.attemptsLeft === undefined ? {} : { attemptsLeft: input.attemptsLeft }),
    };

    // `insert … select … from companies where c.id = $ and c.team_id = $` e não
    // `values`: o par (equipa, empresa) vem do payload de um job, e o worker
    // corre com a service role, sem RLS a segurá-lo (`company-directory.ts:127-130`).
    // Com `values`, um par trocado escrevia uma linha-marcador no gabinete
    // errado — a dizer que a senha de uma empresa que não é dele está inválida.
    // Com o `select`, esse par simplesmente não produz linha nenhuma.
    await this.db.execute(sql`
      insert into ${schema.integrationCredentials} (team_id, company_id, provider, status, metadata)
      select c.team_id, c.id, 'at', 'invalid', ${JSON.stringify(marca)}::jsonb
      from ${schema.companies} c
      where c.id = ${input.companyId} and c.team_id = ${input.teamId}
      -- O índice é parcial; sem repetir o predicado o Postgres não o infere.
      on conflict (company_id, provider) where company_id is not null
      do update set
        status = 'invalid',
        metadata = ${schema.integrationCredentials.metadata} || excluded.metadata,
        updated_at = now()
    `);
  }
}
