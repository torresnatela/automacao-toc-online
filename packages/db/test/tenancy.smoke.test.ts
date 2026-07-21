import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { eq } from "drizzle-orm";
import { createDb } from "../src/index";
import { teams, companies, profiles } from "../src/schema/index";

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

// NISS é UNIQUE global e os inserts commitam (dados acumulam entre execuções).
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

  it("NISS é único globalmente", async () => {
    const a = await makeTeamWithUser();
    const dup = nextNiss();
    await db.insert(companies).values({ teamId: a.teamId, niss: dup, name: "A", type: "employer" });
    await expect(
      db.insert(companies).values({ teamId: a.teamId, niss: dup, name: "B", type: "employer" }),
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
