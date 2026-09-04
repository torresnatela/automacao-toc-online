import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createDb, schema } from "@toc/db";
import { encryptSecret, generateEncryptionKey } from "@toc/core/crypto";
import { IVA_DOCUMENT_JOB_TYPE, IVA_DOCUMENT_TYPE, IVA_OBLIGATION_KIND } from "@toc/core/domain";
import { AtTransientError, StructuralError } from "../../src/errors";
import { DbAttemptGuard } from "../../src/sinks/attempt-guard";
import { DbCredentialSource } from "../../src/sinks/credential-source";
import { SupabaseDocumentStore } from "../../src/sinks/document-store";
import { DbObligationLedger } from "../../src/sinks/obligation-ledger";

// Integração: exige o Supabase local (base de dados + bucket `documents`).
// CI pula com SKIP_DB_TESTS=1.
const SKIP_DB = process.env.SKIP_DB_TESTS === "1";
const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const db = createDb(url);
// Tipado estruturalmente: o worker não declara `pg` como dependência direta
// (vem por @toc/db), e acrescentá-la só para um `end()` seria excesso.
const pool = db.$client as unknown as { end: () => Promise<void> };
const KEY = generateEncryptionKey();

// O Storage precisa das mesmas variáveis que o `index.ts` do worker usa.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SKIP_STORAGE = SKIP_DB || SUPABASE_URL === undefined || SERVICE_ROLE === undefined;

/** Tudo o que o ficheiro cria pendura numa equipa; apagá-la cascateia o resto. */
const equipasCriadas: string[] = [];
/** Objetos do Storage não cascateiam com nada — apagam-se à mão. */
const ficheirosCriados: string[] = [];

afterAll(async () => {
  // O `finally` garante que uma limpeza falhada não deixa o pool aberto (a
  // suite ficaria pendurada em vez de falhar).
  try {
    if (!SKIP_STORAGE && ficheirosCriados.length > 0) {
      await storageClient().storage.from("documents").remove(ficheirosCriados);
    }
    if (equipasCriadas.length > 0) {
      await db.delete(schema.teams).where(inArray(schema.teams.id, equipasCriadas));
    }
  } finally {
    await pool.end();
  }
});

function storageClient(): SupabaseClient {
  if (SUPABASE_URL === undefined || SERVICE_ROLE === undefined) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY em falta");
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** NIFs sintéticos únicos por execução (a constraint é por equipa e os inserts commitam). */
let nifSeq = 500000000;
const nextNif = () => String(++nifSeq).slice(0, 9);

async function makeTeam(): Promise<string> {
  const [team] = await db
    .insert(schema.teams)
    .values({ name: `Gab sinks ${randomUUID()}` })
    .returning();
  equipasCriadas.push(team!.id);
  return team!.id;
}

async function makeCompany(teamId: string, over: { name?: string } = {}) {
  const [company] = await db
    .insert(schema.companies)
    .values({
      teamId,
      name: over.name ?? "Empresa do Sink, Lda",
      nif: nextNif(),
      toconlineCompanyId: Math.floor(Math.random() * 900000) + 100000,
      toconlineCluster: 5,
    })
    .returning();
  return company!;
}

/** Um documento como o runner o entrega ao ledger. */
function doc(over: Partial<Parameters<DbObligationLedger["recordDocument"]>[2]> = {}) {
  return {
    type: IVA_DOCUMENT_TYPE,
    entity: "10341",
    reference: "300 000 000 001",
    amount: "1234.56",
    validUntil: "2026-09-25",
    storagePath: `equipa/empresa/iva/2026-07.pdf`,
    extractedAt: new Date(),
    metadata: { via: "download" as const },
    ...over,
  };
}

async function statusDoPeriodo(periodId: string): Promise<string> {
  const [row] = await db
    .select({ status: schema.obligationPeriods.status })
    .from(schema.obligationPeriods)
    .where(eq(schema.obligationPeriods.id, periodId));
  return row!.status;
}

describe.skipIf(SKIP_DB)("DbObligationLedger", () => {
  it("getCompany devolve o punho da empresa e null fora da equipa", async () => {
    const teamId = await makeTeam();
    const outra = await makeTeam();
    const company = await makeCompany(teamId);
    const ledger = new DbObligationLedger(db);

    const handle = await ledger.getCompany(teamId, company.id);
    expect(handle).toMatchObject({
      id: company.id,
      nif: company.nif,
      tocCluster: 5,
      status: "active",
    });
    expect(await ledger.getCompany(outra, company.id)).toBeNull();
  });

  it("beginPeriod é idempotente: mesmo período, uma só obrigação", async () => {
    const teamId = await makeTeam();
    const company = await makeCompany(teamId);
    const ledger = new DbObligationLedger(db);

    const primeiro = await ledger.beginPeriod(
      teamId,
      company.id,
      "2026-07",
      "2026-09-25",
      "monthly",
    );
    const segundo = await ledger.beginPeriod(
      teamId,
      company.id,
      "2026-07",
      "2026-09-25",
      "monthly",
    );

    expect(segundo.periodId).toBe(primeiro.periodId);
    const obrigacoes = await db
      .select()
      .from(schema.obligations)
      .where(eq(schema.obligations.companyId, company.id));
    expect(obrigacoes).toHaveLength(1);
    expect(obrigacoes[0]?.kind).toBe(IVA_OBLIGATION_KIND);
    expect(await statusDoPeriodo(primeiro.periodId)).toBe("in_progress");
  });

  it("beginPeriod NÃO regride um período já entregue para in_progress", async () => {
    const teamId = await makeTeam();
    const company = await makeCompany(teamId);
    const ledger = new DbObligationLedger(db);

    const { periodId } = await ledger.beginPeriod(teamId, company.id, "2026-07", null, "monthly");
    await ledger.recordDocument(teamId, periodId, doc());
    expect(await statusDoPeriodo(periodId)).toBe("delivered");

    await ledger.beginPeriod(teamId, company.id, "2026-07", "2026-09-25", "monthly");
    expect(await statusDoPeriodo(periodId)).toBe("delivered");
    // A data de vencimento em falta é preenchida pela segunda passagem.
    const [row] = await db
      .select({ dueDate: schema.obligationPeriods.dueDate })
      .from(schema.obligationPeriods)
      .where(eq(schema.obligationPeriods.id, periodId));
    expect(row?.dueDate).toBe("2026-09-25");
  });

  it("beginPeriod recusa uma empresa de outra equipa", async () => {
    const teamId = await makeTeam();
    const outra = await makeTeam();
    const company = await makeCompany(teamId);
    const ledger = new DbObligationLedger(db);

    await expect(
      ledger.beginPeriod(outra, company.id, "2026-07", null, "monthly"),
    ).rejects.toBeInstanceOf(StructuralError);
    const obrigacoes = await db
      .select()
      .from(schema.obligations)
      .where(eq(schema.obligations.companyId, company.id));
    expect(obrigacoes).toHaveLength(0);
  });

  it("recordDocument grava o documento e marca o período entregue", async () => {
    const teamId = await makeTeam();
    const company = await makeCompany(teamId);
    const ledger = new DbObligationLedger(db);

    const { periodId } = await ledger.beginPeriod(
      teamId,
      company.id,
      "2026-07",
      "2026-09-25",
      "monthly",
    );
    const { documentId } = await ledger.recordDocument(teamId, periodId, doc());

    const [row] = await db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, documentId));
    expect(row).toMatchObject({
      type: IVA_DOCUMENT_TYPE,
      entity: "10341",
      reference: "300 000 000 001",
      amount: "1234.56",
      status: "extracted",
    });
    expect(row?.extractedAt).not.toBeNull();
    expect(await statusDoPeriodo(periodId)).toBe("delivered");
  });

  it("um segundo recordDocument atualiza a mesma linha e mescla o metadata", async () => {
    const teamId = await makeTeam();
    const company = await makeCompany(teamId);
    const ledger = new DbObligationLedger(db);

    const { periodId } = await ledger.beginPeriod(teamId, company.id, "2026-07", null, "monthly");
    const primeiro = await ledger.recordDocument(
      teamId,
      periodId,
      doc({ metadata: { via: "download", warnings: [] } }),
    );
    const segundo = await ledger.recordDocument(
      teamId,
      periodId,
      doc({ reference: "300 000 000 002", metadata: { via: "popup" } }),
    );

    expect(segundo.documentId).toBe(primeiro.documentId);
    const linhas = await db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.obligationPeriodId, periodId));
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.reference).toBe("300 000 000 002");
    // Mescla, não substituição: o `warnings` do primeiro sobrevive ao segundo.
    expect(linhas[0]?.metadata).toMatchObject({ via: "popup", warnings: [] });
  });

  it("markPeriod(error) não regride um período entregue, mas marca um em curso", async () => {
    const teamId = await makeTeam();
    const company = await makeCompany(teamId);
    const ledger = new DbObligationLedger(db);

    const entregue = await ledger.beginPeriod(teamId, company.id, "2026-07", null, "monthly");
    await ledger.recordDocument(teamId, entregue.periodId, doc());
    await ledger.markPeriod(teamId, entregue.periodId, "error");
    expect(await statusDoPeriodo(entregue.periodId)).toBe("delivered");

    const emCurso = await ledger.beginPeriod(teamId, company.id, "2026-08", null, "monthly");
    await ledger.markPeriod(teamId, emCurso.periodId, "error");
    expect(await statusDoPeriodo(emCurso.periodId)).toBe("error");

    await ledger.markPeriod(teamId, emCurso.periodId, "skipped_nonexistent");
    expect(await statusDoPeriodo(emCurso.periodId)).toBe("skipped_nonexistent");
  });

  it("nenhuma escrita faz o período descer abaixo de delivered/paid", async () => {
    const teamId = await makeTeam();
    const company = await makeCompany(teamId);
    const ledger = new DbObligationLedger(db);

    const entregue = await ledger.beginPeriod(teamId, company.id, "2026-07", null, "monthly");
    await ledger.recordDocument(teamId, entregue.periodId, doc());
    expect(await statusDoPeriodo(entregue.periodId)).toBe("delivered");

    // `pending` é o que o runner marca quando a declaração do período esperado
    // ainda não foi entregue — e chega lá SEM `force`. Não pode desfazer a guia.
    await ledger.markPeriod(teamId, entregue.periodId, "pending");
    expect(await statusDoPeriodo(entregue.periodId)).toBe("delivered");
    await ledger.markPeriod(teamId, entregue.periodId, "skipped_nonexistent");
    expect(await statusDoPeriodo(entregue.periodId)).toBe("delivered");

    // `paid` é o único que sobe: o portal disse que já está pago.
    await ledger.markPeriod(teamId, entregue.periodId, "paid");
    expect(await statusDoPeriodo(entregue.periodId)).toBe("paid");

    // E `paid` não volta atrás por nada — nem por um `delivered`.
    await ledger.markPeriod(teamId, entregue.periodId, "error");
    await ledger.markPeriod(teamId, entregue.periodId, "pending");
    await ledger.beginPeriod(teamId, company.id, "2026-07", null, "monthly");
    expect(await statusDoPeriodo(entregue.periodId)).toBe("paid");

    // Abaixo de delivered, o estado é o que se manda.
    const emCurso = await ledger.beginPeriod(teamId, company.id, "2026-08", null, "monthly");
    await ledger.markPeriod(teamId, emCurso.periodId, "pending");
    expect(await statusDoPeriodo(emCurso.periodId)).toBe("pending");
  });

  it("recordDocument sobre um período pago guarda o documento sem regredir o estado", async () => {
    const teamId = await makeTeam();
    const company = await makeCompany(teamId);
    const ledger = new DbObligationLedger(db);

    const { periodId } = await ledger.beginPeriod(teamId, company.id, "2026-07", null, "monthly");
    await ledger.markPeriod(teamId, periodId, "paid");

    // O documento é registado na mesma (a guia existe e vale a pena guardá-la);
    // o que não muda é o estado — quem pagou não volta a "por pagar".
    const { documentId } = await ledger.recordDocument(teamId, periodId, doc());

    expect(await statusDoPeriodo(periodId)).toBe("paid");
    const [row] = await db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, documentId));
    expect(row?.storagePath).toBe(doc().storagePath);
  });

  it("escrita cross-team é no-op: o período da equipa A não muda pela equipa B", async () => {
    const teamA = await makeTeam();
    const teamB = await makeTeam();
    const company = await makeCompany(teamA);
    const ledger = new DbObligationLedger(db);

    const { periodId } = await ledger.beginPeriod(teamA, company.id, "2026-07", null, "monthly");

    await ledger.markPeriod(teamB, periodId, "error");
    expect(await statusDoPeriodo(periodId)).toBe("in_progress");

    await expect(ledger.recordDocument(teamB, periodId, doc())).rejects.toBeInstanceOf(
      StructuralError,
    );
    const linhas = await db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.obligationPeriodId, periodId));
    expect(linhas).toHaveLength(0);
    expect(await statusDoPeriodo(periodId)).toBe("in_progress");
  });

  it("getPeriod devolve hasFile e o documento do período", async () => {
    const teamA = await makeTeam();
    const teamB = await makeTeam();
    const company = await makeCompany(teamA);
    const ledger = new DbObligationLedger(db);

    expect(await ledger.getPeriod(teamA, company.id, "2026-07")).toBeNull();

    const { periodId } = await ledger.beginPeriod(teamA, company.id, "2026-07", null, "monthly");
    expect(await ledger.getPeriod(teamA, company.id, "2026-07")).toEqual({
      periodId,
      status: "in_progress",
      documentId: null,
      hasFile: false,
    });

    const { documentId } = await ledger.recordDocument(teamA, periodId, doc());
    expect(await ledger.getPeriod(teamA, company.id, "2026-07")).toEqual({
      periodId,
      status: "delivered",
      documentId,
      hasFile: true,
    });

    // Outra equipa não vê o período, mesmo sabendo o id da empresa.
    expect(await ledger.getPeriod(teamB, company.id, "2026-07")).toBeNull();
  });

  it("getPeriod devolve hasFile false quando o documento não tem ficheiro", async () => {
    const teamId = await makeTeam();
    const company = await makeCompany(teamId);
    const ledger = new DbObligationLedger(db);

    const { periodId } = await ledger.beginPeriod(teamId, company.id, "2026-07", null, "monthly");
    const [documento] = await db
      .insert(schema.documents)
      .values({ obligationPeriodId: periodId, type: IVA_DOCUMENT_TYPE, storagePath: null })
      .returning();

    const state = await ledger.getPeriod(teamId, company.id, "2026-07");
    expect(state).toMatchObject({ documentId: documento!.id, hasFile: false });
  });
});

describe.skipIf(SKIP_DB)("DbCredentialSource — extensão do Módulo 1", () => {
  async function makeCredential(
    teamId: string,
    companyId: string | null,
    over: { provider?: "at" | "toconline"; username?: string } = {},
  ) {
    const [row] = await db
      .insert(schema.integrationCredentials)
      .values({
        teamId,
        companyId,
        provider: over.provider ?? "at",
        username: over.username ?? "utilizador@gabinete.pt",
        secretEncrypted: encryptSecret("senha-secreta", KEY),
      })
      .returning();
    return row!;
  }

  it("findFor prefere a credencial da empresa à da equipa", async () => {
    const teamId = await makeTeam();
    const company = await makeCompany(teamId);
    const outraEmpresa = await makeCompany(teamId, { name: "Sem credencial própria" });
    const source = new DbCredentialSource(db, KEY);

    const daEquipa = await makeCredential(teamId, null);
    const daEmpresa = await makeCredential(teamId, company.id);

    expect(await source.findFor({ teamId, companyId: company.id, provider: "at" })).toEqual({
      credentialId: daEmpresa.id,
    });
    // Empresa sem credencial própria cai na do gabinete.
    expect(await source.findFor({ teamId, companyId: outraEmpresa.id, provider: "at" })).toEqual({
      credentialId: daEquipa.id,
    });
    // Provider errado não devolve nada.
    expect(
      await source.findFor({ teamId, companyId: company.id, provider: "seguranca_social" }),
    ).toBeNull();
  });

  it("markExpired deixa a credencial expirada com o motivo no metadata", async () => {
    const teamId = await makeTeam();
    const source = new DbCredentialSource(db, KEY);
    const cred = await makeCredential(teamId, null, { provider: "toconline" });

    await source.markExpired(cred.id, "senha_expirada");

    expect(await source.load(cred.id)).toEqual({
      ok: false,
      reason: "expired",
      invalidReason: "senha_expirada",
    });
    const [row] = await db
      .select()
      .from(schema.integrationCredentials)
      .where(eq(schema.integrationCredentials.id, cred.id));
    expect(row?.status).toBe("expired");
    expect(row?.metadata).toMatchObject({ invalidReason: "senha_expirada" });
    // Mescla: o que já lá estava não é apagado pela marca.
    expect(row?.username).toBe("utilizador@gabinete.pt");
  });

  it("markCompanyAtInvalid cria a linha-marcador e, repetida, atualiza sem duplicar", async () => {
    const teamId = await makeTeam();
    const company = await makeCompany(teamId);
    const source = new DbCredentialSource(db, KEY);

    await source.markCompanyAtInvalid({
      teamId,
      companyId: company.id,
      reason: "login_rejeitado",
      attemptsLeft: 2,
    });
    await source.markCompanyAtInvalid({
      teamId,
      companyId: company.id,
      reason: "senha_bloqueada",
    });

    const linhas = await db
      .select()
      .from(schema.integrationCredentials)
      .where(
        and(
          eq(schema.integrationCredentials.companyId, company.id),
          eq(schema.integrationCredentials.provider, "at"),
        ),
      );
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.status).toBe("invalid");
    expect(linhas[0]?.metadata).toMatchObject({
      source: "toconline_direct_access",
      invalidReason: "senha_bloqueada",
      // A segunda marca não trouxe `attemptsLeft`; a mescla conserva o da primeira.
      attemptsLeft: 2,
    });
    // Linha-marcador: nunca guarda segredo nenhum.
    expect(linhas[0]?.secretEncrypted).toBeNull();
    expect(linhas[0]?.username).toBeNull();
  });

  it("markCompanyAtInvalid não escreve nada com um par (equipa, empresa) trocado", async () => {
    const teamA = await makeTeam();
    const teamB = await makeTeam();
    const company = await makeCompany(teamA);
    const source = new DbCredentialSource(db, KEY);

    await source.markCompanyAtInvalid({
      teamId: teamB,
      companyId: company.id,
      reason: "login_rejeitado",
    });

    const linhas = await db
      .select()
      .from(schema.integrationCredentials)
      .where(eq(schema.integrationCredentials.companyId, company.id));
    expect(linhas).toHaveLength(0);
  });

  it("markVerified limpa a marca de inválida", async () => {
    const teamId = await makeTeam();
    const source = new DbCredentialSource(db, KEY);
    const cred = await makeCredential(teamId, null, { provider: "toconline" });

    await source.markExpired(cred.id, "senha_expirada");
    await source.markVerified(cred.id);

    const [row] = await db
      .select()
      .from(schema.integrationCredentials)
      .where(eq(schema.integrationCredentials.id, cred.id));
    expect(row?.status).toBe("active");
    expect(row?.lastVerifiedAt).not.toBeNull();
    expect(row?.metadata).not.toHaveProperty("invalidReason");
    expect(row?.metadata).not.toHaveProperty("invalidAt");
    expect(row?.metadata).not.toHaveProperty("attemptsLeft");
    expect(await source.load(cred.id)).toMatchObject({ ok: true, provider: "toconline" });
  });
});

describe.skipIf(SKIP_DB)("DbAttemptGuard", () => {
  async function makeJob(
    teamId: string,
    companyId: string,
    over: { status?: "succeeded" | "failed" | "skipped"; attempts?: number; startedAt?: Date },
  ) {
    const [row] = await db
      .insert(schema.jobs)
      .values({
        teamId,
        companyId,
        type: IVA_DOCUMENT_JOB_TYPE,
        status: over.status ?? "succeeded",
        attempts: over.attempts ?? 1,
        startedAt: over.startedAt ?? new Date(),
      })
      .returning();
    return row!;
  }

  it("soma as tentativas de hoje, ignora skipped, o job excluído e o dia anterior", async () => {
    const teamId = await makeTeam();
    const outraEquipa = await makeTeam();
    const company = await makeCompany(teamId);
    const outraEmpresa = await makeCompany(teamId, { name: "Vizinha" });
    const guard = new DbAttemptGuard(db);

    await makeJob(teamId, company.id, { attempts: 1 });
    await makeJob(teamId, company.id, { attempts: 2, status: "failed" });
    // Não conta: o `skipped` nunca chegou a tocar no portal.
    await makeJob(teamId, company.id, { attempts: 5, status: "skipped" });
    // Não conta: começou ontem.
    await makeJob(teamId, company.id, {
      attempts: 7,
      startedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
    });
    // Não conta: é de outra empresa.
    await makeJob(teamId, outraEmpresa.id, { attempts: 9 });

    expect(await guard.attemptsToday(teamId, company.id, randomUUID())).toBe(3);

    // O próprio job não conta para o seu limite.
    const proprio = await makeJob(teamId, company.id, { attempts: 4 });
    expect(await guard.attemptsToday(teamId, company.id, proprio.id)).toBe(3);
    expect(await guard.attemptsToday(teamId, company.id, randomUUID())).toBe(7);

    // Predicado de equipa: outra equipa não vê as tentativas desta.
    expect(await guard.attemptsToday(outraEquipa, company.id, randomUUID())).toBe(0);
  });

  it("devolve 0 quando não há jobs nenhuns", async () => {
    const teamId = await makeTeam();
    const company = await makeCompany(teamId);
    const guard = new DbAttemptGuard(db);

    expect(await guard.attemptsToday(teamId, company.id, randomUUID())).toBe(0);
  });
});

// Estes três batem no storage-api por HTTP: o timeout é folgado de propósito,
// para uma máquina ocupada não os transformar numa falha que não é do código.
const STORAGE_TIMEOUT = 20_000;

describe.skipIf(SKIP_STORAGE)("SupabaseDocumentStore", () => {
  const pdf = Buffer.from(`%PDF-1.4\n${"x".repeat(1200)}\n%%EOF`);

  it(
    "guarda o PDF no caminho do período e devolve os bytes escritos",
    async () => {
      const client = storageClient();
      const store = new SupabaseDocumentStore(client);
      const teamId = randomUUID();
      const companyId = randomUUID();
      const esperado = `${teamId}/${companyId}/iva/2026-07.pdf`;
      ficheirosCriados.push(esperado);

      const stored = await store.put({ teamId, companyId, kind: "iva", period: "2026-07", pdf });

      expect(stored).toEqual({ storagePath: esperado, bytes: pdf.length });
      const { data, error } = await client.storage.from("documents").download(esperado);
      expect(error).toBeNull();
      const bytes = Buffer.from(await data!.arrayBuffer());
      expect(bytes.equals(pdf)).toBe(true);
    },
    STORAGE_TIMEOUT,
  );

  it(
    "upsert: buscar a guia do mesmo período outra vez sobrescreve o ficheiro",
    async () => {
      const client = storageClient();
      const store = new SupabaseDocumentStore(client);
      const teamId = randomUUID();
      const companyId = randomUUID();
      const caminho = `${teamId}/${companyId}/iva/2026-08.pdf`;
      ficheirosCriados.push(caminho);
      const segundoPdf = Buffer.from(`%PDF-1.4\n${"y".repeat(1300)}\n%%EOF`);

      await store.put({ teamId, companyId, kind: "iva", period: "2026-08", pdf });
      const stored = await store.put({
        teamId,
        companyId,
        kind: "iva",
        period: "2026-08",
        pdf: segundoPdf,
      });

      expect(stored.storagePath).toBe(caminho);
      const { data } = await client.storage.from("documents").download(caminho);
      const bytes = Buffer.from(await data!.arrayBuffer());
      expect(bytes.equals(segundoPdf)).toBe(true);
    },
    STORAGE_TIMEOUT,
  );

  it(
    "uma recusa 4xx do Storage é estrutural (não se retenta um bucket que não existe)",
    async () => {
      const store = new SupabaseDocumentStore(storageClient(), `inexistente-${randomUUID()}`);

      await expect(
        store.put({
          teamId: randomUUID(),
          companyId: randomUUID(),
          kind: "iva",
          period: "2026-07",
          pdf,
        }),
      ).rejects.toBeInstanceOf(StructuralError);
    },
    STORAGE_TIMEOUT,
  );
});

/**
 * Sem Supabase: só a classificação do erro, que é onde vive a decisão de
 * retentar. Um cliente falso basta — o que se prova não tem nada que ver com a
 * rede.
 */
describe("SupabaseDocumentStore × classificação do erro", () => {
  function storeQueDevolve(error: unknown): SupabaseDocumentStore {
    const client = {
      storage: { from: () => ({ upload: async () => ({ error }) }) },
    } as unknown as SupabaseClient;
    return new SupabaseDocumentStore(client);
  }

  const put = (store: SupabaseDocumentStore) =>
    store.put({
      teamId: randomUUID(),
      companyId: randomUUID(),
      kind: "iva" as const,
      period: "2026-07",
      pdf: Buffer.from("%PDF-1.4\n"),
    });

  it("status 0 é transitório — foi a rede, não uma recusa do Storage", async () => {
    // `status: 0` é o que o `fetch` do storage-js põe quando a resposta nunca
    // chegou (DNS, socket cortado). Tratá-lo como 4xx marcaria a guia como
    // recusada para sempre por uma falha de rede, e o operador não teria nada
    // para corrigir.
    await expect(
      put(storeQueDevolve({ status: 0, message: "Failed to fetch" })),
    ).rejects.toBeInstanceOf(AtTransientError);
  });

  it("um 5xx também é transitório e um 4xx continua estrutural", async () => {
    await expect(put(storeQueDevolve({ status: 503 }))).rejects.toBeInstanceOf(AtTransientError);
    await expect(put(storeQueDevolve({ status: 404 }))).rejects.toBeInstanceOf(StructuralError);
  });
});

describe.skipIf(SKIP_DB)("view iva_documents_overview × constantes do domínio", () => {
  it("devolve job_outcome do job de IVA e o documento do tipo IVA", async () => {
    const teamId = await makeTeam();
    const company = await makeCompany(teamId);
    const ledger = new DbObligationLedger(db);

    const { periodId } = await ledger.beginPeriod(
      teamId,
      company.id,
      "2026-07",
      "2026-09-25",
      "monthly",
    );
    await ledger.recordDocument(
      teamId,
      periodId,
      doc({ storagePath: `${teamId}/${company.id}/iva/2026-07.pdf` }),
    );
    await db.insert(schema.jobs).values({
      teamId,
      companyId: company.id,
      type: IVA_DOCUMENT_JOB_TYPE,
      status: "succeeded",
      result: { outcome: "fetched", period: "2026-07" },
    });

    // A view repete `iva`, `iva_payment` e `rpa.fetch_iva_document` em SQL. Aqui
    // quem escreve são as constantes de @toc/core/domain — se divergirem, os
    // campos vêm nulos e o teste cai (em vez de a listagem ficar vazia em silêncio).
    const { rows } = await db.execute(sql`
      select period, period_status, has_file, document_id, job_status, job_outcome, job_period
      from public.iva_documents_overview
      where company_id = ${company.id}
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      period: "2026-07",
      period_status: "delivered",
      has_file: true,
      job_status: "succeeded",
      job_outcome: "fetched",
      job_period: "2026-07",
    });
    expect(rows[0]?.document_id).not.toBeNull();
  });
});
