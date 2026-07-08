import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { eq } from "drizzle-orm";
import { createDb } from "../src/index";
import { profiles } from "../src/schema/index";

// Testes de integração exigem o Supabase local (RLS/trigger dependem de
// auth.users/auth.uid()). No CI, SKIP_DB_TESTS=1 os pula.
const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const db = createDb(url);
const pool = db.$client as unknown as Pool;

afterAll(async () => {
  await pool.end();
});

// Executa `fn` numa transação impersonando o papel `authenticated` com
// auth.uid() = userId (via request.jwt.claims). Sempre faz rollback: isola o
// teste e reseta o `set local role`.
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

// Impersona service_role: JWT sem 'sub' → auth.uid() é NULL. Rollback ao final.
async function asServiceRole<T>(fn: (c: PoolClient) => Promise<T>) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ role: "service_role" }),
    ]);
    await c.query("set local role service_role");
    return await fn(c);
  } finally {
    await c.query("rollback").catch(() => {});
    c.release();
  }
}

describe.skipIf(process.env.SKIP_DB_TESTS === "1")(
  "profiles: guard de auth (must_change_password + anti auto-promoção)",
  () => {
    it("must_change_password tem default false ao inserir profile direto", async () => {
      const id = randomUUID();
      const [row] = await db
        .insert(profiles)
        .values({ id, email: `${id}@teste.local` })
        .returning();
      expect(row!.mustChangePassword).toBe(false);
    });

    it("handle_new_user cria o profile com must_change_password=true e role viewer", async () => {
      const id = randomUUID();
      await pool.query(
        `insert into auth.users
           (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
         values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated',
                 'authenticated', $2, '', now(), now())`,
        [id, `${id}@teste.local`],
      );
      const [row] = await db.select().from(profiles).where(eq(profiles.id, id));
      expect(row!.mustChangePassword).toBe(true);
      expect(row!.role).toBe("viewer");
    });

    it("usuário autenticado NÃO promove o próprio papel", async () => {
      const id = randomUUID();
      await db
        .insert(profiles)
        .values({ id, email: `${id}@teste.local`, role: "viewer" });
      await expect(
        asUser(id, (c) =>
          c.query("update public.profiles set role = 'admin' where id = $1", [id]),
        ),
      ).rejects.toThrow();
    });

    it("service role CONSEGUE setar o papel do usuário", async () => {
      const id = randomUUID();
      await db
        .insert(profiles)
        .values({ id, email: `${id}@teste.local`, role: "viewer" });
      const role = await asServiceRole(async (c) => {
        await c.query("update public.profiles set role = 'admin' where id = $1", [
          id,
        ]);
        const r = await c.query<{ role: string }>(
          "select role from public.profiles where id = $1",
          [id],
        );
        return r.rows[0]!.role;
      });
      expect(role).toBe("admin");
    });

    it("usuário autenticado NÃO limpa o próprio must_change_password", async () => {
      const id = randomUUID();
      await db
        .insert(profiles)
        .values({ id, email: `${id}@teste.local`, mustChangePassword: true });
      await expect(
        asUser(id, (c) =>
          c.query(
            "update public.profiles set must_change_password = false where id = $1",
            [id],
          ),
        ),
      ).rejects.toThrow();
    });
  },
);
