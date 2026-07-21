import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { eq } from "drizzle-orm";
import { createDb } from "../src/index";
import {
  teams,
  companies,
  profiles,
  obligations,
  obligationPeriods,
  documents,
} from "../src/schema/index";

// Integração: exige Supabase local (RLS depende de auth.uid()). CI pula com SKIP_DB_TESTS=1.
const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const db = createDb(url);
const pool = db.$client as unknown as Pool;

afterAll(async () => {
  await pool.end();
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

// Cria uma equipe e um usuário (profile) atribuído a ela. Papel default viewer.
async function makeTeamWithUser(role: "viewer" | "admin" = "viewer") {
  const [team] = await db.insert(teams).values({ name: `Gab ${randomUUID()}` }).returning();
  const userId = randomUUID();
  await db.insert(profiles).values({
    id: userId,
    email: `${userId}@teste.local`,
    role,
    teamId: role === "admin" ? null : team!.id,
  });
  return { teamId: team!.id, userId };
}

// NISS é UNIQUE por equipe e os inserts commitam (dados acumulam entre execuções).
// Base derivada do relógio garante unicidade por execução; seq garante dentro dela.
let nissSeq = Date.now() * 100;
function nextNiss() {
  return ++nissSeq;
}
async function makeCompany(teamId: string) {
  const [c] = await db
    .insert(companies)
    .values({ teamId, niss: nextNiss(), name: "Empresa X", type: "employer" })
    .returning();
  return c!;
}

// Cria a árvore obrigação → período → documento sob uma empresa (para testar o
// isolamento das tabelas-filhas do tenant).
async function makeDocument(companyId: string) {
  const [o] = await db
    .insert(obligations)
    .values({ companyId, kind: "ss_contribuicoes" })
    .returning();
  const [p] = await db
    .insert(obligationPeriods)
    .values({ obligationId: o!.id, period: "2026-07" })
    .returning();
  const [d] = await db
    .insert(documents)
    .values({ obligationPeriodId: p!.id, type: "guia", storagePath: "/segredo.pdf" })
    .returning();
  return { obligationId: o!.id, periodId: p!.id, documentId: d!.id };
}

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("tenancy: isolamento por equipe (RLS)", () => {
  it("usuário lê empresas da própria equipe, mas NÃO de outra", async () => {
    const a = await makeTeamWithUser();
    const b = await makeTeamWithUser();
    const cA = await makeCompany(a.teamId);
    const cB = await makeCompany(b.teamId);

    const seen = await asUser(a.userId, async (c) => {
      const own = await c.query("select id from public.companies where id = $1", [cA.id]);
      const other = await c.query("select id from public.companies where id = $1", [cB.id]);
      return { own: own.rowCount, other: other.rowCount };
    });

    expect(seen.own).toBe(1);
    expect(seen.other).toBe(0);
  });

  it("admin global (sem equipe) lê empresas de qualquer equipe", async () => {
    const admin = await makeTeamWithUser("admin");
    const a = await makeTeamWithUser();
    const cA = await makeCompany(a.teamId);

    const count = await asUser(admin.userId, async (c) => {
      const r = await c.query("select id from public.companies where id = $1", [cA.id]);
      return r.rowCount;
    });

    expect(count).toBe(1);
  });

  it("usuário lê a própria equipe, mas NÃO outra", async () => {
    const a = await makeTeamWithUser();
    const b = await makeTeamWithUser();

    const seen = await asUser(a.userId, async (c) => {
      const own = await c.query("select id from public.teams where id = $1", [a.teamId]);
      const other = await c.query("select id from public.teams where id = $1", [b.teamId]);
      return { own: own.rowCount, other: other.rowCount };
    });

    expect(seen.own).toBe(1);
    expect(seen.other).toBe(0);
  });

  it("NISS é único por equipe, mas equipes diferentes podem repetir o mesmo NISS", async () => {
    const a = await makeTeamWithUser();
    const b = await makeTeamWithUser();
    const dup = nextNiss();
    await db.insert(companies).values({ teamId: a.teamId, niss: dup, name: "A", type: "employer" });
    // Mesma equipe + mesmo NISS → viola company_niss_team_uq.
    await expect(
      db.insert(companies).values({ teamId: a.teamId, niss: dup, name: "A2", type: "employer" }),
    ).rejects.toThrow();
    // Outra equipe + mesmo NISS → permitido (o contribuinte pode mudar de gabinete).
    const [ok] = await db
      .insert(companies)
      .values({ teamId: b.teamId, niss: dup, name: "B", type: "employer" })
      .returning();
    expect(ok?.id).toBeTruthy();
  });

  it("usuário NÃO lê obrigações/períodos/documentos de outra equipe (tabelas-filhas)", async () => {
    const a = await makeTeamWithUser();
    const b = await makeTeamWithUser();
    const cB = await makeCompany(b.teamId);
    const docB = await makeDocument(cB.id);

    const seen = await asUser(a.userId, async (c) => {
      const obl = await c.query("select id from public.obligations where id = $1", [docB.obligationId]);
      const per = await c.query("select id from public.obligation_periods where id = $1", [docB.periodId]);
      const doc = await c.query("select id from public.documents where id = $1", [docB.documentId]);
      return { obl: obl.rowCount, per: per.rowCount, doc: doc.rowCount };
    });

    expect(seen.obl).toBe(0);
    expect(seen.per).toBe(0);
    expect(seen.doc).toBe(0);
  });

  it("usuário LÊ os documentos da própria equipe", async () => {
    const a = await makeTeamWithUser();
    const cA = await makeCompany(a.teamId);
    const docA = await makeDocument(cA.id);

    const count = await asUser(a.userId, async (c) => {
      const r = await c.query("select id from public.documents where id = $1", [docA.documentId]);
      return r.rowCount;
    });

    expect(count).toBe(1);
  });

  it("usuário autenticado NÃO insere empresa direto no banco (sem policy de INSERT)", async () => {
    const a = await makeTeamWithUser();
    await expect(
      asUser(a.userId, (c) =>
        c.query(
          "insert into public.companies (team_id, niss, name, type) values ($1, $2, 'X', 'employer')",
          [a.teamId, nextNiss()],
        ),
      ),
    ).rejects.toThrow();
  });

  it("apagar a equipe faz cascade nas empresas", async () => {
    const a = await makeTeamWithUser();
    const c = await makeCompany(a.teamId);
    await db.delete(teams).where(eq(teams.id, a.teamId));
    const rows = await db.select().from(companies).where(eq(companies.id, c.id));
    expect(rows).toHaveLength(0);
  });

  it("usuário autenticado NÃO troca a própria equipe (guard trigger)", async () => {
    const a = await makeTeamWithUser();
    const b = await makeTeamWithUser();
    await expect(
      asUser(a.userId, (c) =>
        c.query("update public.profiles set team_id = $1 where id = $2", [b.teamId, a.userId]),
      ),
    ).rejects.toThrow();
  });
});
