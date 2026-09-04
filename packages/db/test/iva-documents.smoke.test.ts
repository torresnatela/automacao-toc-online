import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { inArray } from "drizzle-orm";
import { createDb } from "../src/index";
import {
  teams,
  companies,
  profiles,
  obligations,
  obligationPeriods,
  documents,
  jobs,
} from "../src/schema/index";
// Os literais do Módulo 1 vivem no domínio (Task 2) e são repetidos na view SQL.
// Importar daqui é o que torna a divergência detetável: se a constante mudar sem
// a migration mudar, os testes 4/5 caem. Caminho relativo ao source do @toc/core
// porque @toc/db não pode depender de @toc/core (@toc/core já depende de @toc/db).
import {
  IVA_DOCUMENT_JOB_TYPE,
  IVA_DOCUMENT_TYPE,
  IVA_OBLIGATION_KIND,
} from "../../core/src/domain/at/types";
import {
  OBLIGATION_KINDS,
  OBLIGATION_FREQUENCIES,
  OBLIGATION_PERIOD_STATUSES,
  DOCUMENT_STATUSES,
} from "../../core/src/domain/types";

// Integração: exige Supabase local (RLS depende de auth.uid()). CI pula com SKIP_DB_TESTS=1.
const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const db = createDb(url);
const pool = db.$client as unknown as Pool;

// Tipo de job "de varredura" (sem empresa) exclusivo deste ficheiro: os jobs
// commitam e acumulam entre execuções, e um tipo partilhado colidiria com os
// smoke tests vizinhos.
const SCAN_JOB_TYPE = `test.varredura.${randomUUID()}`;

// Tudo o que o ficheiro cria é apagado no fim (equipes cascateiam empresas →
// obrigações → períodos → documentos → jobs; profiles ficam por `set null`).
const createdTeamIds: string[] = [];
const createdUserIds: string[] = [];
const createdStorageObjectIds: string[] = [];

afterAll(async () => {
  // O `finally` é o que garante que uma limpeza falhada não deixa o pool aberto
  // (a suite ficaria pendurada em vez de falhar).
  try {
    if (createdStorageObjectIds.length > 0) {
      await pool.query("delete from storage.objects where id = any($1::uuid[])", [
        createdStorageObjectIds,
      ]);
    }
    if (createdUserIds.length > 0) {
      await db.delete(profiles).where(inArray(profiles.id, createdUserIds));
    }
    if (createdTeamIds.length > 0) {
      await db.delete(teams).where(inArray(teams.id, createdTeamIds));
    }
  } finally {
    await pool.end();
  }
});

// Impersona `authenticated` com auth.uid() = userId; rollback ao final.
async function asUser<T>(userId: string, fn: (c: PoolClient) => Promise<T>) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    await c.query("set local role authenticated");
    return await fn(c);
  } finally {
    await c.query("rollback").catch(() => {});
    c.release();
  }
}

// Cria uma equipe e um usuário (profile) atribuído a ela. Papel default operator
// (é quem opera o Módulo 1 no dashboard).
async function makeTeamWithUser(role: "viewer" | "operator" | "admin" = "operator") {
  const [team] = await db
    .insert(teams)
    .values({ name: `Gab ${randomUUID()}` })
    .returning();
  const userId = randomUUID();
  await db.insert(profiles).values({
    id: userId,
    email: `${userId}@teste.local`,
    role,
    teamId: role === "admin" ? null : team!.id,
  });
  createdTeamIds.push(team!.id);
  createdUserIds.push(userId);
  return { teamId: team!.id, userId };
}

async function makeCompany(teamId: string, name = "Empresa X") {
  const [c] = await db.insert(companies).values({ teamId, name }).returning();
  return c!;
}

/** Árvore IVA de uma empresa: obrigação → período → (opcionalmente) documento. */
async function makeIvaTree(companyId: string, opts: { storagePath?: string | null } = {}) {
  const [o] = await db
    .insert(obligations)
    .values({ companyId, kind: IVA_OBLIGATION_KIND })
    .returning();
  const [p] = await db
    .insert(obligationPeriods)
    .values({ obligationId: o!.id, period: "2026-07", dueDate: "2026-09-25" })
    .returning();
  const [d] = await db
    .insert(documents)
    .values({
      obligationPeriodId: p!.id,
      type: IVA_DOCUMENT_TYPE,
      storagePath: opts.storagePath ?? null,
    })
    .returning();
  return { obligationId: o!.id, periodId: p!.id, documentId: d!.id };
}

/** Executa e devolve o erro do Postgres; falha se a operação passar. */
async function pgErrorOf(run: () => Promise<unknown>): Promise<{ code?: string; message: string }> {
  try {
    await run();
  } catch (e) {
    return e as { code?: string; message: string };
  }
  throw new Error("esperava violação de constraint, mas a operação passou");
}

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("jobs — idempotência por empresa", () => {
  it("recusa um segundo job in-flight para o mesmo par (empresa, tipo)", async () => {
    const { teamId } = await makeTeamWithUser();
    const company = await makeCompany(teamId);

    const [first] = await db
      .insert(jobs)
      .values({ teamId, companyId: company.id, type: IVA_DOCUMENT_JOB_TYPE })
      .returning();
    expect(first!.status).toBe("pending");

    const err = await pgErrorOf(() =>
      db.insert(jobs).values({ teamId, companyId: company.id, type: IVA_DOCUMENT_JOB_TYPE }),
    );
    expect(err.code).toBe("23505");
    expect(err.message).toMatch(/jobs_company_inflight_uq/);
  });

  it("depois de o job terminar, um novo job da mesma empresa é aceite", async () => {
    const { teamId } = await makeTeamWithUser();
    const company = await makeCompany(teamId);

    const [first] = await db
      .insert(jobs)
      .values({ teamId, companyId: company.id, type: IVA_DOCUMENT_JOB_TYPE })
      .returning();
    await pool.query("update public.jobs set status = 'succeeded' where id = $1", [first!.id]);

    await expect(
      db.insert(jobs).values({ teamId, companyId: company.id, type: IVA_DOCUMENT_JOB_TYPE }),
    ).resolves.toBeDefined();
  });

  it("jobs sem empresa (varredura) convivem — NULL fica fora do índice parcial", async () => {
    const { teamId } = await makeTeamWithUser();
    await db.insert(jobs).values({ teamId, type: SCAN_JOB_TYPE });
    await expect(db.insert(jobs).values({ teamId, type: SCAN_JOB_TYPE })).resolves.toBeDefined();
  });
});

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("obligations — uma por (empresa, tipo)", () => {
  it("recusa uma segunda obrigação de IVA para a mesma empresa", async () => {
    const { teamId } = await makeTeamWithUser();
    const company = await makeCompany(teamId);
    await db.insert(obligations).values({ companyId: company.id, kind: IVA_OBLIGATION_KIND });

    const err = await pgErrorOf(() =>
      db.insert(obligations).values({ companyId: company.id, kind: IVA_OBLIGATION_KIND }),
    );
    expect(err.code).toBe("23505");
    expect(err.message).toMatch(/obligation_company_kind_uq/);
  });

  it("o upsert do worker devolve a obrigação existente em vez de duplicar", async () => {
    const { teamId } = await makeTeamWithUser();
    const company = await makeCompany(teamId);
    const [first] = await db
      .insert(obligations)
      .values({ companyId: company.id, kind: IVA_OBLIGATION_KIND, frequency: "monthly" })
      .returning();

    const [again] = await db
      .insert(obligations)
      .values({ companyId: company.id, kind: IVA_OBLIGATION_KIND, frequency: "quarterly" })
      .onConflictDoUpdate({
        target: [obligations.companyId, obligations.kind],
        set: { frequency: "quarterly" },
      })
      .returning();

    expect(again!.id).toBe(first!.id);
    expect(again!.frequency).toBe("quarterly");
  });
});

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("documents — um por (período, tipo)", () => {
  it("recusa uma segunda guia de IVA no mesmo período", async () => {
    const { teamId } = await makeTeamWithUser();
    const company = await makeCompany(teamId);
    const tree = await makeIvaTree(company.id, { storagePath: "a/b/c.pdf" });

    const err = await pgErrorOf(() =>
      db.insert(documents).values({ obligationPeriodId: tree.periodId, type: IVA_DOCUMENT_TYPE }),
    );
    expect(err.code).toBe("23505");
    expect(err.message).toMatch(/document_period_type_uq/);
  });

  it("um documento de outro tipo no mesmo período é aceite", async () => {
    const { teamId } = await makeTeamWithUser();
    const company = await makeCompany(teamId);
    const tree = await makeIvaTree(company.id);

    await expect(
      db.insert(documents).values({ obligationPeriodId: tree.periodId, type: "guia" }),
    ).resolves.toBeDefined();
  });
});

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("view iva_documents_overview", () => {
  it("escopa por equipe: o operador só vê as empresas da sua; o admin vê ambas", async () => {
    const a = await makeTeamWithUser("operator");
    const b = await makeTeamWithUser("operator");
    const cA = await makeCompany(a.teamId, "Empresa A");
    const cB = await makeCompany(b.teamId, "Empresa B");

    const seenByA = await asUser(a.userId, async (c) =>
      (
        await c.query(
          "select company_id from public.iva_documents_overview where company_id = any($1::uuid[])",
          [[cA.id, cB.id]],
        )
      ).rows.map((r) => (r as { company_id: string }).company_id),
    );
    expect(seenByA).toEqual([cA.id]);

    const admin = await makeTeamWithUser("admin");
    const seenByAdmin = await asUser(admin.userId, async (c) =>
      (
        await c.query(
          "select company_id from public.iva_documents_overview where company_id = any($1::uuid[])",
          [[cA.id, cB.id]],
        )
      ).rows.map((r) => (r as { company_id: string }).company_id),
    );
    expect([...seenByAdmin].sort()).toEqual([cA.id, cB.id].sort());
  });

  it("expõe has_file (true/false) e NUNCA a coluna storage_path", async () => {
    const a = await makeTeamWithUser("operator");
    const comFicheiro = await makeCompany(a.teamId, "Com ficheiro");
    const semFicheiro = await makeCompany(a.teamId, "Sem ficheiro");
    await makeIvaTree(comFicheiro.id, { storagePath: `${a.teamId}/x/iva/2026-07.pdf` });
    await makeIvaTree(semFicheiro.id, { storagePath: null });

    const rows = await asUser(
      a.userId,
      async (c) =>
        (
          await c.query(
            "select company_id, has_file, period, document_status from public.iva_documents_overview where company_id = any($1::uuid[])",
            [[comFicheiro.id, semFicheiro.id]],
          )
        ).rows as { company_id: string; has_file: boolean; period: string | null }[],
    );

    expect(rows.find((r) => r.company_id === comFicheiro.id)?.has_file).toBe(true);
    expect(rows.find((r) => r.company_id === semFicheiro.id)?.has_file).toBe(false);
    expect(rows.find((r) => r.company_id === comFicheiro.id)?.period).toBe("2026-07");

    const cols = await pool.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'iva_documents_overview'",
    );
    const names = cols.rows.map((r) => r.column_name);
    expect(names).not.toContain("storage_path");
    expect(names).toContain("has_file");
  });

  it("devolve o desfecho do job mais recente (result.reason, last_error.outcome)", async () => {
    const a = await makeTeamWithUser("operator");
    const company = await makeCompany(a.teamId, "Com jobs");

    const outcomeOf = () =>
      asUser(
        a.userId,
        async (c) =>
          (
            await c.query(
              "select job_status, job_outcome, job_error from public.iva_documents_overview where company_id = $1",
              [company.id],
            )
          ).rows[0] as { job_status: string; job_outcome: string | null; job_error: string | null },
      );

    // Falha: o desfecho vem de last_error.outcome (result é nulo).
    await db.insert(jobs).values({
      teamId: a.teamId,
      companyId: company.id,
      type: IVA_DOCUMENT_JOB_TYPE,
      status: "failed",
      lastError: { message: "x", outcome: "at_login_rejected" },
      createdAt: new Date("2026-09-01T10:00:00Z"),
    });
    expect(await outcomeOf()).toMatchObject({
      job_status: "failed",
      job_outcome: "at_login_rejected",
      job_error: "x",
    });

    // Job mais recente: a lateral tem de o preferir ao anterior.
    await db.insert(jobs).values({
      teamId: a.teamId,
      companyId: company.id,
      type: IVA_DOCUMENT_JOB_TYPE,
      status: "skipped",
      result: { reason: "no_payment_document" },
      createdAt: new Date("2026-09-02T10:00:00Z"),
    });
    expect(await outcomeOf()).toMatchObject({
      job_status: "skipped",
      job_outcome: "no_payment_document",
    });
  });
});

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("storage — bucket documents", () => {
  it("existe, é privado, só aceita PDF e está limitado a 10 MiB", async () => {
    const { rows } = await pool.query<{
      public: boolean;
      allowed_mime_types: string[] | null;
      file_size_limit: string | null;
    }>(
      "select public, allowed_mime_types, file_size_limit from storage.buckets where id = 'documents'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.public).toBe(false);
    expect(rows[0]!.allowed_mime_types).toEqual(["application/pdf"]);
    // 10 MiB. É a propriedade que mais facilmente derivaria se o bucket voltasse
    // a ser declarado em dois sítios (migration + config.toml); fica afirmada
    // aqui para que a divergência apareça como um teste vermelho.
    expect(Number(rows[0]!.file_size_limit)).toBe(10485760);
  });

  it("nenhum papel autenticado lista objetos do bucket (leitura só por signed URL)", async () => {
    const { userId } = await makeTeamWithUser("operator");
    const objectId = randomUUID();
    await pool.query(
      "insert into storage.objects (id, bucket_id, name, owner, metadata) values ($1, 'documents', $2, null, '{}'::jsonb)",
      [objectId, `teste/${objectId}.pdf`],
    );
    createdStorageObjectIds.push(objectId);

    const rows = await asUser(
      userId,
      async (c) =>
        (await c.query("select id from storage.objects where bucket_id = 'documents'")).rows,
    );
    expect(rows).toHaveLength(0);
  });
});

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("enums do domínio ↔ pgEnum", () => {
  async function enumValues(name: string) {
    const { rows } = await pool.query<{ vals: string[] }>(
      `select enum_range(null::${name})::text[] as vals`,
    );
    return rows[0]!.vals;
  }

  // Se um mudar, o outro muda junto: as listas de @toc/core são a base de
  // validação da aplicação e o pgEnum é a do banco — divergir é aceitar dados
  // que uma ponta considera válidos e a outra recusa.
  it("obligation_kind bate com OBLIGATION_KINDS", async () => {
    expect(await enumValues("obligation_kind")).toEqual([...OBLIGATION_KINDS]);
  });

  it("obligation_frequency bate com OBLIGATION_FREQUENCIES", async () => {
    expect(await enumValues("obligation_frequency")).toEqual([...OBLIGATION_FREQUENCIES]);
  });

  it("obligation_period_status bate com OBLIGATION_PERIOD_STATUSES", async () => {
    expect(await enumValues("obligation_period_status")).toEqual([...OBLIGATION_PERIOD_STATUSES]);
  });

  it("document_status bate com DOCUMENT_STATUSES", async () => {
    expect(await enumValues("document_status")).toEqual([...DOCUMENT_STATUSES]);
  });
});
