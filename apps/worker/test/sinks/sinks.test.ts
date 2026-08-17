import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDb, schema } from "@toc/db";
import { encryptSecret, generateEncryptionKey } from "@toc/core/crypto";
import { planCompanyReconciliation, type ScannedCompany } from "@toc/core/domain";
import { DbCompanyDirectory } from "../../src/sinks/company-directory";
import { DbCredentialSource } from "../../src/sinks/credential-source";

// Integração: exige Supabase local. CI pula com SKIP_DB_TESTS=1.
const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const db = createDb(url);
// Tipado estruturalmente: o worker não declara `pg` como dependência direta
// (vem por @toc/db), e acrescentá-la só para um `end()` seria excesso.
const pool = db.$client as unknown as { end: () => Promise<void> };
const KEY = generateEncryptionKey();

afterAll(async () => {
  await pool.end();
});

async function makeTeam() {
  const [team] = await db
    .insert(schema.teams)
    .values({ name: `Gab worker ${randomUUID()}` })
    .returning();
  return team!.id;
}

/** NIFs sintéticos únicos por execução (a constraint é por equipe e os inserts commitam). */
let nifSeq = 200000000;
const nextNif = () => String(++nifSeq).slice(0, 9);

function scanned(over: Partial<ScannedCompany> = {}): ScannedCompany {
  return {
    tocCompanyId: Math.floor(Math.random() * 900000) + 100000,
    nif: nextNif(),
    name: "Empresa Importada, Lda",
    cluster: 5,
    active: true,
    demo: false,
    accounting: true,
    roles: "Contabilista responsável",
    ...over,
  };
}

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("DbCompanyDirectory", () => {
  it("cria as empresas novas com a referência de acesso direto", async () => {
    const teamId = await makeTeam();
    const directory = new DbCompanyDirectory(db);
    const entry = scanned();

    const plan = planCompanyReconciliation([entry], []);
    const report = await directory.apply(teamId, plan);

    expect(report.created).toBe(1);
    const [row] = await db
      .select()
      .from(schema.companies)
      .where(eq(schema.companies.teamId, teamId));
    expect(row?.toconlineCompanyId).toBe(entry.tocCompanyId);
    expect(row?.toconlineCluster).toBe(5);
    expect(row?.toconlineSyncedAt).not.toBeNull();
    // O TOConline não informa nenhum dos dois — inventá-los faria um dado
    // adivinhado parecer verificado.
    expect(row?.niss).toBeNull();
    expect(row?.type).toBeNull();
  });

  it("list devolve o que a reconciliação precisa de saber", async () => {
    const teamId = await makeTeam();
    const directory = new DbCompanyDirectory(db);
    await directory.apply(teamId, planCompanyReconciliation([scanned()], []));

    const existing = await directory.list(teamId);
    expect(existing).toHaveLength(1);
    expect(existing[0]).toMatchObject({ status: "active", tocCluster: 5 });
  });

  it("é idempotente: correr duas vezes não duplica nem altera", async () => {
    const teamId = await makeTeam();
    const directory = new DbCompanyDirectory(db);
    const entries = [scanned(), scanned()];

    await directory.apply(teamId, planCompanyReconciliation(entries, []));
    const depois = await directory.list(teamId);
    const segundo = await directory.apply(teamId, planCompanyReconciliation(entries, depois));

    expect(segundo).toMatchObject({ created: 0, updated: 0, linked: 0, unchanged: 2 });
    expect(await directory.list(teamId)).toHaveLength(2);
  });

  it("adota uma empresa cadastrada à mão, casando por NIF", async () => {
    const teamId = await makeTeam();
    const directory = new DbCompanyDirectory(db);
    const entry = scanned({ name: "Nome do TOConline, Lda" });

    await db.insert(schema.companies).values({
      teamId,
      name: "Nome Antigo",
      nif: entry.nif,
      niss: Date.now(),
      type: "employer",
    });

    const report = await directory.apply(
      teamId,
      planCompanyReconciliation([entry], await directory.list(teamId)),
    );

    expect(report).toMatchObject({ linked: 1, created: 0 });
    const [row] = await db
      .select()
      .from(schema.companies)
      .where(eq(schema.companies.teamId, teamId));
    expect(row?.toconlineCompanyId).toBe(entry.tocCompanyId);
    expect(row?.name).toBe("Nome do TOConline, Lda");
    // O que era do operador sobrevive à adoção.
    expect(row?.niss).not.toBeNull();
    expect(row?.type).toBe("employer");
  });

  it("atualiza nome e estado quando mudam no TOConline", async () => {
    const teamId = await makeTeam();
    const directory = new DbCompanyDirectory(db);
    const entry = scanned();
    await directory.apply(teamId, planCompanyReconciliation([entry], []));

    const alterada = { ...entry, name: "Novo Nome, Lda", active: false };
    const report = await directory.apply(
      teamId,
      planCompanyReconciliation([alterada], await directory.list(teamId)),
    );

    expect(report.updated).toBe(1);
    const [row] = await db
      .select()
      .from(schema.companies)
      .where(eq(schema.companies.teamId, teamId));
    expect(row?.name).toBe("Novo Nome, Lda");
    expect(row?.status).toBe("inactive");
  });

  it("não apaga quem sumiu do TOConline — só marca", async () => {
    const teamId = await makeTeam();
    const directory = new DbCompanyDirectory(db);
    await directory.apply(teamId, planCompanyReconciliation([scanned()], []));

    const report = await directory.apply(
      teamId,
      planCompanyReconciliation([], await directory.list(teamId)),
    );

    expect(report.missing).toBe(1);
    const rows = await db.select().from(schema.companies).where(eq(schema.companies.teamId, teamId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("active"); // continua ativa: sumir não é desativar
    expect(JSON.stringify(rows[0]?.metadata)).toContain("missingSince");
  });

  it("o metadata da varredura não apaga o que já lá estava", async () => {
    const teamId = await makeTeam();
    const directory = new DbCompanyDirectory(db);
    const entry = scanned();
    await directory.apply(teamId, planCompanyReconciliation([entry], []));

    const [antes] = await db
      .select()
      .from(schema.companies)
      .where(eq(schema.companies.teamId, teamId));
    await db
      .update(schema.companies)
      .set({ metadata: { ...(antes!.metadata as object), notaDoOperador: "importante" } })
      .where(eq(schema.companies.id, antes!.id));

    await directory.apply(
      teamId,
      planCompanyReconciliation([{ ...entry, name: "Muda" }], await directory.list(teamId)),
    );

    const [depois] = await db
      .select()
      .from(schema.companies)
      .where(eq(schema.companies.id, antes!.id));
    expect(JSON.stringify(depois?.metadata)).toContain("notaDoOperador");
    expect(JSON.stringify(depois?.metadata)).toContain("scannedAt");
  });

  it("não persiste empresas demo", async () => {
    const teamId = await makeTeam();
    const directory = new DbCompanyDirectory(db);

    const report = await directory.apply(
      teamId,
      planCompanyReconciliation([scanned({ demo: true })], []),
    );

    expect(report.created).toBe(0);
    expect(await directory.list(teamId)).toHaveLength(0);
  });
});

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("DbCredentialSource", () => {
  async function makeCredential(over: { secret?: string | null; status?: "active" | "invalid" | "expired" } = {}) {
    const teamId = await makeTeam();
    const [row] = await db
      .insert(schema.integrationCredentials)
      .values({
        teamId,
        provider: "toconline",
        username: "gabinete@example.pt",
        secretEncrypted: over.secret === undefined ? encryptSecret("senha-secreta", KEY) : over.secret,
        status: over.status ?? "active",
      })
      .returning();
    return row!.id;
  }

  it("decifra o segredo guardado pelo dashboard", async () => {
    const id = await makeCredential();
    const source = new DbCredentialSource(db, KEY);

    const lookup = await source.load(id);

    expect(lookup.ok).toBe(true);
    if (!lookup.ok) return;
    expect(lookup.credentials.username).toBe("gabinete@example.pt");
    expect(lookup.credentials.password).toBe("senha-secreta");
  });

  it("credencial inexistente → not_found", async () => {
    const source = new DbCredentialSource(db, KEY);
    expect(await source.load(randomUUID())).toEqual({ ok: false, reason: "not_found" });
  });

  it("credencial sem segredo → not_found", async () => {
    const id = await makeCredential({ secret: null });
    const source = new DbCredentialSource(db, KEY);
    expect(await source.load(id)).toEqual({ ok: false, reason: "not_found" });
  });

  it("credencial marcada inválida não é sequer decifrada", async () => {
    const id = await makeCredential({ status: "invalid" });
    const source = new DbCredentialSource(db, KEY);
    expect(await source.load(id)).toEqual({ ok: false, reason: "invalid" });
  });

  // O cenário da chave trocada: não pode virar exceção nem apagar a linha.
  it("chave errada → invalid, e a credencial fica marcada para reconfiguração", async () => {
    const id = await makeCredential();
    const source = new DbCredentialSource(db, generateEncryptionKey());

    const lookup = await source.load(id);

    expect(lookup).toEqual({ ok: false, reason: "invalid" });
    const [row] = await db
      .select()
      .from(schema.integrationCredentials)
      .where(eq(schema.integrationCredentials.id, id));
    expect(row?.status).toBe("invalid");
    expect(JSON.stringify(row?.metadata)).toContain("decrypt_failed");
    // Nunca apagar: perder-se-ia o utilizador e o rasto de auditoria.
    expect(row?.username).toBe("gabinete@example.pt");
  });

  it("markVerified reativa e carimba a verificação", async () => {
    const id = await makeCredential({ status: "invalid" });
    const source = new DbCredentialSource(db, KEY);

    await source.markVerified(id);

    const [row] = await db
      .select()
      .from(schema.integrationCredentials)
      .where(eq(schema.integrationCredentials.id, id));
    expect(row?.status).toBe("active");
    expect(row?.lastVerifiedAt).not.toBeNull();
  });

  it("markInvalid não toca no segredo guardado", async () => {
    const id = await makeCredential();
    const source = new DbCredentialSource(db, KEY);
    const [antes] = await db
      .select()
      .from(schema.integrationCredentials)
      .where(eq(schema.integrationCredentials.id, id));

    await source.markInvalid(id, "login_rejeitado");

    const [depois] = await db
      .select()
      .from(schema.integrationCredentials)
      .where(eq(schema.integrationCredentials.id, id));
    expect(depois?.secretEncrypted).toBe(antes?.secretEncrypted);
    expect(depois?.status).toBe("invalid");
  });
});
