import { eq } from "drizzle-orm";
import type { Database } from "@toc/db";
import { schema } from "@toc/db";
import { decryptSecret } from "@toc/core/crypto";
import type { CredentialLookup, CredentialSource } from "../runner/ports";

/**
 * Resolve a credencial do TOConline a partir de `integration_credentials`.
 *
 * É o único ponto do worker onde o segredo volta a ser texto claro — e ele
 * nunca sai daqui a não ser dentro do objeto de credenciais entregue à sessão.
 * Nenhum erro desta classe inclui o segredo: quando a decifra falha, o que se
 * devolve é um motivo, não um valor.
 */
export class DbCredentialSource implements CredentialSource {
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
      })
      .from(schema.integrationCredentials)
      .where(eq(schema.integrationCredentials.id, credentialId))
      .limit(1);

    if (!row || !row.username || !row.secret) return { ok: false, reason: "not_found" };
    if (row.status === "invalid") return { ok: false, reason: "invalid" };
    if (row.status === "expired") return { ok: false, reason: "expired" };

    try {
      const password = decryptSecret(row.secret, this.encryptionKey);
      return { ok: true, credentials: { username: row.username, password } };
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
      .set({ status: "active", lastVerifiedAt: new Date(), updatedAt: new Date() })
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
}
