import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { eq } from "drizzle-orm";
import { createDb } from "../src/index";
import { teams, companies, profiles, integrationCredentials, jobs } from "../src/schema/index";

// Integração: exige Supabase local (RLS depende de auth.uid()). CI pula com SKIP_DB_TESTS=1.
const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const db = createDb(url);
const pool = db.$client as unknown as Pool;

afterAll(async () => {
  await pool.end();
});

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

/** NIFs sintéticos únicos por execução (a constraint é por equipe, e os inserts commitam). */
let nifSeq = 100000000;
function nextNif() {
  return String(++nifSeq).slice(0, 9);
}

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("integration_credentials", () => {
  it("aceita uma credencial de nível equipe (company_id nulo)", async () => {
    const { teamId } = await makeTeamWithUser();
    const [row] = await db
      .insert(integrationCredentials)
      .values({ teamId, provider: "toconline", username: "gabinete@example.pt" })
      .returning();

    expect(row?.companyId).toBeNull();
    expect(row?.status).toBe("active");
    expect(row?.metadata).toEqual({});
  });

  it("recusa uma segunda credencial do mesmo provider para a mesma equipe", async () => {
    const { teamId } = await makeTeamWithUser();
    await db.insert(integrationCredentials).values({ teamId, provider: "toconline" });

    await expect(
      db.insert(integrationCredentials).values({ teamId, provider: "toconline" }),
    ).rejects.toThrow(/credential_team_provider_uq/);
  });

  it("permite credencial por empresa a conviver com a do gabinete", async () => {
    const { teamId } = await makeTeamWithUser();
    const [company] = await db
      .insert(companies)
      .values({ teamId, name: "Empresa", nif: nextNif() })
      .returning();

    await db.insert(integrationCredentials).values({ teamId, provider: "toconline" });
    await expect(
      db
        .insert(integrationCredentials)
        .values({ teamId, companyId: company!.id, provider: "toconline" }),
    ).resolves.toBeDefined();
  });

  it("apagar a equipe cascateia a credencial", async () => {
    const { teamId } = await makeTeamWithUser();
    const [row] = await db
      .insert(integrationCredentials)
      .values({ teamId, provider: "at" })
      .returning();

    await db.delete(teams).where(eq(teams.id, teamId));
    const found = await db
      .select()
      .from(integrationCredentials)
      .where(eq(integrationCredentials.id, row!.id));
    expect(found).toHaveLength(0);
  });

  // A garantia central do módulo: o ciphertext não é alcançável por HTTP.
  describe("o segredo cifrado nunca é legível por papel autenticado", () => {
    it("nem sequer o admin lê a tabela base", async () => {
      const { teamId } = await makeTeamWithUser();
      await db
        .insert(integrationCredentials)
        .values({ teamId, provider: "toconline", secretEncrypted: "v1:aa:bb:cc" });

      const { userId: adminId } = await makeTeamWithUser("admin");
      const rows = await asUser(adminId, async (c) =>
        (await c.query("select * from public.integration_credentials")).rows,
      );
      expect(rows).toHaveLength(0);
    });

    it("a view não expõe a coluna do segredo", async () => {
      const { userId } = await makeTeamWithUser();
      await expect(
        asUser(userId, (c) =>
          c.query("select secret_encrypted from public.integration_credentials_safe"),
        ),
      ).rejects.toThrow(/secret_encrypted/);
    });

    it("a view mostra a credencial da própria equipe, com has_secret", async () => {
      const { teamId, userId } = await makeTeamWithUser();
      await db.insert(integrationCredentials).values({
        teamId,
        provider: "toconline",
        username: "gabinete@example.pt",
        secretEncrypted: "v1:aa:bb:cc",
      });

      const rows = await asUser(userId, async (c) =>
        (await c.query("select username, has_secret from public.integration_credentials_safe")).rows,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ username: "gabinete@example.pt", has_secret: true });
    });

    it("a view não vaza credenciais de outra equipe", async () => {
      const outra = await makeTeamWithUser();
      await db
        .insert(integrationCredentials)
        .values({ teamId: outra.teamId, provider: "toconline", secretEncrypted: "v1:aa:bb:cc" });

      const { userId } = await makeTeamWithUser();
      const rows = await asUser(userId, async (c) =>
        (await c.query("select id from public.integration_credentials_safe")).rows,
      );
      expect(rows).toHaveLength(0);
    });
  });
});

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("companies — chaves da varredura", () => {
  it("aceita NISS e tipo nulos (é o que a varredura consegue preencher)", async () => {
    const { teamId } = await makeTeamWithUser();
    const [row] = await db
      .insert(companies)
      .values({ teamId, name: "Importada do TOConline", nif: nextNif() })
      .returning();

    expect(row?.niss).toBeNull();
    expect(row?.type).toBeNull();
  });

  it("NIF é único por equipe", async () => {
    const { teamId } = await makeTeamWithUser();
    const nif = nextNif();
    await db.insert(companies).values({ teamId, name: "A", nif });

    await expect(db.insert(companies).values({ teamId, name: "B", nif })).rejects.toThrow(
      /company_nif_team_uq/,
    );
  });

  it("o mesmo NIF noutra equipe é permitido — dois gabinetes partilham clientes", async () => {
    const a = await makeTeamWithUser();
    const b = await makeTeamWithUser();
    const nif = nextNif();

    await db.insert(companies).values({ teamId: a.teamId, name: "A", nif });
    await expect(
      db.insert(companies).values({ teamId: b.teamId, name: "B", nif }),
    ).resolves.toBeDefined();
  });

  it("vários NIFs nulos convivem na mesma equipe (NULLs são distintos)", async () => {
    const { teamId } = await makeTeamWithUser();
    await db.insert(companies).values({ teamId, name: "Sem NIF 1" });
    await expect(
      db.insert(companies).values({ teamId, name: "Sem NIF 2" }),
    ).resolves.toBeDefined();
  });

  it("o id do TOConline é único por equipe", async () => {
    const { teamId } = await makeTeamWithUser();
    await db
      .insert(companies)
      .values({ teamId, name: "A", nif: nextNif(), toconlineCompanyId: 515814 });

    await expect(
      db.insert(companies).values({ teamId, name: "B", nif: nextNif(), toconlineCompanyId: 515814 }),
    ).rejects.toThrow(/company_toconline_team_uq/);
  });

  it("guarda a referência de acesso direto", async () => {
    const { teamId } = await makeTeamWithUser();
    const [row] = await db
      .insert(companies)
      .values({
        teamId,
        name: "Empresa",
        nif: nextNif(),
        toconlineCompanyId: 515814,
        toconlineCluster: 5,
      })
      .returning();

    expect(row?.toconlineCompanyId).toBe(515814);
    expect(row?.toconlineCluster).toBe(5);
  });
});

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("jobs — escopo por equipe", () => {
  it("um utilizador lê os jobs da própria equipe", async () => {
    const { teamId, userId } = await makeTeamWithUser();
    await db.insert(jobs).values({ teamId, type: `test.scan.${randomUUID()}` });

    const rows = await asUser(userId, async (c) =>
      (await c.query("select id from public.jobs where team_id = $1", [teamId])).rows,
    );
    expect(rows).toHaveLength(1);
  });

  it("não lê os jobs de outra equipe", async () => {
    const outra = await makeTeamWithUser();
    await db.insert(jobs).values({ teamId: outra.teamId, type: `test.scan.${randomUUID()}` });

    const { userId } = await makeTeamWithUser();
    const rows = await asUser(userId, async (c) =>
      (await c.query("select id from public.jobs where team_id = $1", [outra.teamId])).rows,
    );
    expect(rows).toHaveLength(0);
  });

  it("job de sistema (team_id nulo) é invisível para não-admin", async () => {
    const type = `test.sistema.${randomUUID()}`;
    await db.insert(jobs).values({ type });

    const { userId } = await makeTeamWithUser();
    const rows = await asUser(userId, async (c) =>
      (await c.query("select id from public.jobs where type = $1", [type])).rows,
    );
    expect(rows).toHaveLength(0);
  });

  it("o admin lê tudo", async () => {
    const outra = await makeTeamWithUser();
    const type = `test.scan.${randomUUID()}`;
    await db.insert(jobs).values({ teamId: outra.teamId, type });

    const { userId: adminId } = await makeTeamWithUser("admin");
    const rows = await asUser(adminId, async (c) =>
      (await c.query("select id from public.jobs where type = $1", [type])).rows,
    );
    expect(rows).toHaveLength(1);
  });
});
