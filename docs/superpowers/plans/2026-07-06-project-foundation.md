# Base do Projeto (Automação TOConline) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a base fundacional do monorepo (tooling, Supabase local, schema do BD, biblioteca de observabilidade em TDD, auth do dashboard, scaffold do worker, CI e documentação de IA) — sem nenhuma feature de negócio.

**Architecture:** Monorepo pnpm+Turborepo com `apps/web` (Next.js → Vercel), `apps/worker` (scaffold Node+Playwright) e `packages/{db,core,config}` compartilhados, todos falando com um Supabase (Postgres = verdade + Auth + Storage). Observabilidade é um modelo de tracing persistido (traces → events → logs) exposto por uma lib tipada em `packages/core`. Fila de trabalho é a tabela `jobs`.

**Tech Stack:** TypeScript (strict), pnpm, Turborepo, Next.js (App Router), Drizzle ORM + drizzle-kit, Supabase (CLI/Docker) + Supabase Auth, Vitest, Playwright, ESLint (flat) + Prettier, GitHub Actions.

## Global Constraints

- **Node:** 24 LTS. `engines.node >= 22`. `.nvmrc` = `24`.
- **Package manager:** pnpm (workspaces). `packageManager` fixado no root `package.json`. Todos os scripts via `pnpm`.
- **TypeScript:** strict em todo o repo (`strict: true`, `noUncheckedIndexedAccess: true`). Sem `any` implícito.
- **Migrations rodam à parte do dev server:** nunca acopladas ao boot de `apps/web`/`apps/worker`. Sempre via scripts `db:*`.
- **Fonte da verdade do schema:** schema Drizzle em `packages/db/src/schema/*`. Migrations SQL são geradas por `drizzle-kit` e versionadas em `supabase/migrations/`.
- **RLS ligado em todas as tabelas de aplicação.** Worker usa service role (bypass). Dashboard acessa conforme `profiles.role`.
- **IDs:** `uuid` com `gen_random_uuid()`. Timestamps `timestamptz`.
- **Commits:** Conventional Commits. Trabalho feito na branch `feat/project-foundation` (criada a partir de `main`), PR ao final.
- **Sem segredos no repo:** apenas `.env.example`. Nada de `.env` versionado.
- **TDD:** todo código de lógica (notadamente `packages/core`) segue red → green → refactor.

---

## File Structure

```
package.json                      root: scripts turbo, devDeps compartilhadas
pnpm-workspace.yaml               workspaces: apps/*, packages/*
turbo.json                        pipeline build/test/lint/typecheck
tsconfig.base.json                config TS base (strict) estendida por todos
.nvmrc .gitignore .prettierrc .env.example .editorconfig
eslint.config.js                  flat config raiz
.github/workflows/ci.yml          lint+typecheck+test
.github/pull_request_template.md

packages/config/                  tsconfig base reexport + eslint preset
  package.json  tsconfig.base.json  eslint-preset.js

packages/db/                      Drizzle: schema, client, migrate glue, seed
  package.json  tsconfig.json  drizzle.config.ts  vitest.config.ts
  src/
    schema/
      enums.ts                    todos os pgEnum
      auth.ts                     profiles
      observability.ts            traces, events, logs
      jobs.ts                     jobs
      domain.ts                   clients, obligations, obligation_periods, documents, integration_credentials
      index.ts                    re-export
    client.ts                     drizzle client (pg) + factory p/ service role
    index.ts                      public API do package
  test/
    schema.smoke.test.ts          migração aplica + CRUD básico + RLS off/on

packages/core/                    tipos de domínio + Tracer/Logger (TDD)
  package.json  tsconfig.json  vitest.config.ts
  src/
    observability/
      types.ts                    tipos do tracer/logger
      store.ts                    interface ObservabilityStore + DbStore
      tracer.ts                   Tracer, TraceHandle, EventHandle
      logger.ts                   Logger (bound a trace/event)
      index.ts
    index.ts
  test/
    tracer.test.ts                TDD: trace/event/log/árvore
    logger.test.ts

apps/web/                         Next.js App Router: auth + página de observabilidade
  package.json  tsconfig.json  next.config.ts  vitest.config.ts  playwright.config.ts
  src/
    lib/supabase/{server.ts,client.ts,middleware.ts}
    lib/auth.ts                   getSessionUser + requireRole
    app/layout.tsx  app/page.tsx
    app/login/page.tsx  app/login/actions.ts
    app/(dashboard)/traces/page.tsx
    middleware.ts
  e2e/login.spec.ts

apps/worker/                      SCAFFOLD ONLY
  package.json  tsconfig.json  README.md  src/index.ts

docs/
  architecture.md  event-logging.md  database.md  local-development.md  conventions.md
CLAUDE.md  README.md
supabase/config.toml  supabase/seed.sql  supabase/migrations/*
```

---

## Task 0: Branch de trabalho

**Files:** nenhum (git).

- [ ] **Step 1: Criar a branch a partir de `main`**

Run:

```bash
git checkout -b feat/project-foundation
git branch --show-current
```

Expected: `feat/project-foundation`

---

## Task 1: Esqueleto do monorepo + tooling

**Files:**

- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.nvmrc`, `.gitignore`, `.prettierrc`, `.editorconfig`, `.env.example`, `eslint.config.js`
- Create: `packages/config/package.json`, `packages/config/tsconfig.base.json`, `packages/config/eslint-preset.js`

**Interfaces:**

- Produces: workspace `@toc/config` com `tsconfig.base.json` e `eslint-preset.js`; scripts root `pnpm build|test|lint|typecheck` (via turbo); TS base strict que todos estendem.

- [ ] **Step 1: `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 2: root `package.json`**

```json
{
  "name": "automacao-toc-online",
  "private": true,
  "version": "0.0.0",
  "packageManager": "pnpm@9.15.0",
  "engines": { "node": ">=22" },
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "db:start": "supabase start",
    "db:stop": "supabase stop",
    "db:reset": "supabase db reset",
    "db:migrate": "supabase migration up",
    "db:generate": "pnpm --filter @toc/db db:generate",
    "db:seed": "supabase db reset"
  },
  "devDependencies": {
    "turbo": "^2.3.0",
    "prettier": "^3.4.0",
    "typescript": "^5.7.0",
    "eslint": "^9.17.0",
    "@eslint/js": "^9.17.0",
    "typescript-eslint": "^8.19.0"
  }
}
```

- [ ] **Step 3: `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**", "!.next/cache/**"] },
    "dev": { "cache": false, "persistent": true },
    "test": { "dependsOn": ["^build"] },
    "lint": {},
    "typecheck": { "dependsOn": ["^build"] }
  }
}
```

- [ ] **Step 4: `tsconfig.base.json` (root) e `packages/config/tsconfig.base.json`**

Ambos com o mesmo conteúdo (root estende config para uso local; `@toc/config` é o pacote consumido pelos workspaces):

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 5: `packages/config/package.json` e `eslint-preset.js`**

`packages/config/package.json`:

```json
{
  "name": "@toc/config",
  "version": "0.0.0",
  "private": true,
  "exports": {
    "./tsconfig": "./tsconfig.base.json",
    "./eslint": "./eslint-preset.js"
  }
}
```

`packages/config/eslint-preset.js`:

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/.next/**", "**/node_modules/**", "**/.turbo/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
```

- [ ] **Step 6: `eslint.config.js` (root) reexporta o preset**

```js
import preset from "@toc/config/eslint";
export default preset;
```

- [ ] **Step 7: arquivos de suporte**

`.nvmrc`:

```
24
```

`.prettierrc`:

```json
{ "semi": true, "singleQuote": false, "printWidth": 100, "trailingComma": "all" }
```

`.editorconfig`:

```ini
root = true
[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
```

`.gitignore`:

```gitignore
node_modules/
.turbo/
dist/
.next/
out/
coverage/
*.log
.env
.env.*
!.env.example
.DS_Store
supabase/.branches/
supabase/.temp/
playwright-report/
test-results/
```

`.env.example`:

```dotenv
# Supabase (valores locais padrão do `supabase start`; sobrescreva conforme o output)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key do `supabase status`>
SUPABASE_SERVICE_ROLE_KEY=<service_role key do `supabase status`>
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

- [ ] **Step 8: Instalar e verificar**

Run:

```bash
pnpm install
pnpm lint
```

Expected: `pnpm install` conclui; `pnpm lint` roda sem erro (nenhum pacote com lint ainda → turbo reporta "no tasks" ou sucesso).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: monorepo skeleton (pnpm+turborepo+ts+eslint+prettier)"
```

---

## Task 2: Supabase local + `packages/db` (Drizzle base)

**Files:**

- Create: `supabase/config.toml` (via `supabase init`), `supabase/seed.sql`
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/drizzle.config.ts`, `packages/db/vitest.config.ts`
- Create: `packages/db/src/schema/index.ts` (vazio inicial), `packages/db/src/client.ts`, `packages/db/src/index.ts`

**Interfaces:**

- Produces: `@toc/db` exportando `createDb(connectionString)` → `Drizzle` client, e `schema` (re-export). Script `pnpm --filter @toc/db db:generate`.

- [ ] **Step 1: Inicializar Supabase**

Run:

```bash
supabase init
```

Expected: cria `supabase/config.toml`. (Se a CLI não estiver instalada: `brew install supabase/tap/supabase`.)

- [ ] **Step 2: `packages/db/package.json`**

```json
{
  "name": "@toc/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts", "./schema": "./src/schema/index.ts" },
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "lint": "eslint src"
  },
  "dependencies": {
    "drizzle-orm": "^0.38.0",
    "postgres": "^3.4.5"
  },
  "devDependencies": {
    "drizzle-kit": "^0.30.0",
    "@toc/config": "workspace:*",
    "vitest": "^2.1.0",
    "typescript": "^5.7.0",
    "eslint": "^9.17.0"
  }
}
```

- [ ] **Step 3: `packages/db/tsconfig.json`**

```json
{
  "extends": "@toc/config/tsconfig",
  "compilerOptions": { "outDir": "dist", "rootDir": "." },
  "include": ["src", "test", "drizzle.config.ts"]
}
```

- [ ] **Step 4: `packages/db/drizzle.config.ts`**

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "../../supabase/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  },
  migrations: { prefix: "timestamp" },
});
```

- [ ] **Step 5: `packages/db/src/client.ts`**

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

export type Database = ReturnType<typeof createDb>;

export function createDb(connectionString: string) {
  const sql = postgres(connectionString, { prepare: false });
  return drizzle(sql, { schema });
}
```

- [ ] **Step 6: `packages/db/src/schema/index.ts` (placeholder vazio, preenchido nas próximas tasks)**

```ts
// Re-export de todas as tabelas/enums. Preenchido nas Tasks 3–4.
export {};
```

- [ ] **Step 7: `packages/db/src/index.ts`**

```ts
export { createDb, type Database } from "./client.js";
export * as schema from "./schema/index.js";
```

- [ ] **Step 8: `packages/db/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node", include: ["test/**/*.test.ts"] } });
```

- [ ] **Step 9: Subir o stack e verificar**

Run:

```bash
pnpm install
pnpm db:start
supabase status
```

Expected: `supabase start` sobe containers Docker e imprime URL/keys locais. Copie `anon` e `service_role` para o seu `.env` (a partir do `.env.example`).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore(db): supabase local + drizzle base (@toc/db)"
```

---

## Task 3: Schema backbone — auth + observabilidade + jobs (com RLS)

**Files:**

- Create: `packages/db/src/schema/enums.ts`, `auth.ts`, `observability.ts`, `jobs.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/test/backbone.smoke.test.ts`
- Create (gerado): `supabase/migrations/<ts>_backbone.sql` + policies RLS

**Interfaces:**

- Produces: tabelas `profiles`, `traces`, `events`, `logs`, `jobs` e enums `app_role`, `trigger_kind`, `trace_status`, `event_status`, `log_level`, `job_status`. Colunas exatamente como no spec §5.1–5.3. Estes nomes são consumidos por `packages/core` (Task 5) e `apps/web` (Tasks 6–7).

- [ ] **Step 1: Escrever o teste de fumaça (falha primeiro)**

`packages/db/test/backbone.smoke.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { createDb } from "../src/index.js";
import { traces, events, logs } from "../src/schema/index.js";
import { eq } from "drizzle-orm";

const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const db = createDb(url);

describe("backbone schema", () => {
  it("insere um trace, um event filho e um log ligados", async () => {
    const [trace] = await db
      .insert(traces)
      .values({ rootTrigger: "manual", triggerSource: "test" })
      .returning();
    const [evt] = await db
      .insert(events)
      .values({
        traceId: trace.id,
        type: "test.event",
        source: "test",
        occurredAt: new Date(),
      })
      .returning();
    const [log] = await db
      .insert(logs)
      .values({
        traceId: trace.id,
        eventId: evt.id,
        level: "info",
        message: "ok",
        loggedAt: new Date(),
      })
      .returning();

    expect(evt.traceId).toBe(trace.id);
    expect(log.eventId).toBe(evt.id);

    const found = await db.select().from(events).where(eq(events.traceId, trace.id));
    expect(found).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Rodar o teste — deve falhar**

Run: `pnpm --filter @toc/db test`
Expected: FAIL (tabelas/exports inexistentes).

- [ ] **Step 3: `packages/db/src/schema/enums.ts`**

```ts
import { pgEnum } from "drizzle-orm/pg-core";

export const appRole = pgEnum("app_role", ["admin", "operator", "viewer"]);
export const triggerKind = pgEnum("trigger_kind", ["webhook", "schedule", "manual", "system"]);
export const traceStatus = pgEnum("trace_status", ["open", "completed", "failed"]);
export const eventStatus = pgEnum("event_status", [
  "pending",
  "in_progress",
  "succeeded",
  "failed",
  "skipped",
]);
export const logLevel = pgEnum("log_level", ["debug", "info", "warn", "error"]);
export const jobStatus = pgEnum("job_status", [
  "pending",
  "running",
  "succeeded",
  "failed",
  "skipped",
  "cancelled",
]);
```

- [ ] **Step 4: `packages/db/src/schema/auth.ts`**

```ts
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { appRole } from "./enums.js";

// Espelha auth.users(id). Sem FK explícita ao schema auth (gerido pelo Supabase); ligada por trigger SQL.
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  email: text("email"),
  fullName: text("full_name"),
  role: appRole("role").notNull().default("viewer"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 5: `packages/db/src/schema/observability.ts`**

```ts
import { pgTable, uuid, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { triggerKind, traceStatus, eventStatus, logLevel } from "./enums.js";

export const traces = pgTable("traces", {
  id: uuid("id").primaryKey().defaultRandom(),
  rootTrigger: triggerKind("root_trigger").notNull(),
  triggerSource: text("trigger_source"),
  correlationKey: text("correlation_key"),
  status: traceStatus("status").notNull().default("open"),
  metadata: jsonb("metadata").notNull().default({}),
  createdBy: uuid("created_by"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    traceId: uuid("trace_id")
      .notNull()
      .references(() => traces.id, { onDelete: "cascade" }),
    parentEventId: uuid("parent_event_id"),
    type: text("type").notNull(),
    source: text("source").notNull(),
    status: eventStatus("status").notNull().default("pending"),
    payload: jsonb("payload").notNull().default({}),
    error: jsonb("error"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("events_trace_id_idx").on(t.traceId),
    index("events_parent_idx").on(t.parentEventId),
    index("events_type_idx").on(t.type),
    index("events_occurred_at_idx").on(t.occurredAt),
  ],
);

export const logs = pgTable(
  "logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    traceId: uuid("trace_id")
      .notNull()
      .references(() => traces.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "cascade" }),
    level: logLevel("level").notNull(),
    message: text("message").notNull(),
    data: jsonb("data").notNull().default({}),
    loggedAt: timestamp("logged_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("logs_trace_id_idx").on(t.traceId),
    index("logs_event_id_idx").on(t.eventId),
    index("logs_level_idx").on(t.level),
  ],
);
```

- [ ] **Step 6: `packages/db/src/schema/jobs.ts`**

```ts
import { pgTable, uuid, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { jobStatus } from "./enums.js";
import { sql } from "drizzle-orm";

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    traceId: uuid("trace_id"),
    triggeringEventId: uuid("triggering_event_id"),
    type: text("type").notNull(),
    status: jobStatus("status").notNull().default("pending"),
    payload: jsonb("payload").notNull().default({}),
    result: jsonb("result"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    lastError: jsonb("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("jobs_pending_idx")
      .on(t.status, t.scheduledFor)
      .where(sql`${t.status} = 'pending'`),
  ],
);
```

- [ ] **Step 7: `packages/db/src/schema/index.ts` (backbone)**

```ts
export * from "./enums.js";
export * from "./auth.js";
export * from "./observability.js";
export * from "./jobs.js";
```

- [ ] **Step 8: Gerar a migration**

Run: `pnpm db:generate`
Expected: cria `supabase/migrations/<ts>_*.sql` com as tabelas/enums.

- [ ] **Step 9: Adicionar RLS + trigger de profiles (migration SQL manual)**

Criar `supabase/migrations/<ts+1>_backbone_rls.sql` (use timestamp posterior; conteúdo literal):

```sql
-- RLS backbone
alter table public.profiles enable row level security;
alter table public.traces enable row level security;
alter table public.events enable row level security;
alter table public.logs enable row level security;
alter table public.jobs enable row level security;

-- Helper: papel do usuário atual
create or replace function public.current_app_role() returns text
language sql stable security definer set search_path = public as $$
  select role::text from public.profiles where id = auth.uid();
$$;

-- Leitura para qualquer autenticado (dashboard). Escrita só via service role (bypassa RLS).
create policy "read_profiles" on public.profiles for select to authenticated using (true);
create policy "read_traces"   on public.traces   for select to authenticated using (true);
create policy "read_events"   on public.events   for select to authenticated using (true);
create policy "read_logs"     on public.logs     for select to authenticated using (true);
create policy "read_jobs"     on public.jobs     for select to authenticated using (true);

-- Cada usuário pode atualizar o próprio profile (exceto role — checagem por trigger abaixo)
create policy "update_own_profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Cria profile automaticamente ao criar auth.users
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
```

- [ ] **Step 10: Aplicar migrations**

Run: `pnpm db:reset`
Expected: recria o banco e aplica todas as migrations sem erro.

- [ ] **Step 11: Rodar o teste — deve passar**

Run: `pnpm --filter @toc/db test`
Expected: PASS (o teste usa conexão direta = superuser, RLS não bloqueia).

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat(db): backbone schema (auth, observability, jobs) + RLS"
```

---

## Task 4: Schema esqueleto de domínio (com RLS)

**Files:**

- Create: `packages/db/src/schema/domain.ts`
- Modify: `packages/db/src/schema/index.ts`, `packages/db/src/schema/enums.ts`
- Create: `packages/db/test/domain.smoke.test.ts`
- Create (gerado + manual): migrations do domínio + RLS

**Interfaces:**

- Produces: `clients`, `obligations`, `obligationPeriods`, `documents`, `integrationCredentials` e enums `client_status`, `obligation_kind`, `obligation_frequency`, `obligation_period_status`, `document_status`, `integration_provider`, `credential_status`. Conforme spec §5.4.

- [ ] **Step 1: Teste de fumaça (falha primeiro)**

`packages/db/test/domain.smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createDb } from "../src/index.js";
import { clients, obligations, obligationPeriods } from "../src/schema/index.js";
import { eq } from "drizzle-orm";

const db = createDb(
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);

describe("domain skeleton", () => {
  it("cliente → obrigação → período, com unicidade por (obligation, period)", async () => {
    const [c] = await db.insert(clients).values({ name: "ACME Lda", nif: "500000000" }).returning();
    const [o] = await db.insert(obligations).values({ clientId: c.id, kind: "iva" }).returning();
    const [p] = await db
      .insert(obligationPeriods)
      .values({ obligationId: o.id, period: "2026-06" })
      .returning();
    expect(p.status).toBe("pending");

    await expect(
      db.insert(obligationPeriods).values({ obligationId: o.id, period: "2026-06" }),
    ).rejects.toThrow(); // viola unique (idempotência)

    const found = await db.select().from(obligations).where(eq(obligations.clientId, c.id));
    expect(found).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Rodar — deve falhar**

Run: `pnpm --filter @toc/db test domain`
Expected: FAIL (exports inexistentes).

- [ ] **Step 3: Acrescentar enums de domínio em `enums.ts`**

```ts
export const clientStatus = pgEnum("client_status", ["active", "inactive"]);
export const obligationKind = pgEnum("obligation_kind", [
  "iva",
  "irs_retencao",
  "dmr",
  "ss_contribuicoes",
  "other",
]);
export const obligationFrequency = pgEnum("obligation_frequency", [
  "monthly",
  "quarterly",
  "annual",
  "other",
]);
export const obligationPeriodStatus = pgEnum("obligation_period_status", [
  "pending",
  "in_progress",
  "delivered",
  "paid",
  "skipped_nonexistent",
  "error",
  "not_applicable",
]);
export const documentStatus = pgEnum("document_status", ["extracted", "sent", "error"]);
export const integrationProvider = pgEnum("integration_provider", [
  "toconline",
  "at",
  "seguranca_social",
  "efatura",
]);
export const credentialStatus = pgEnum("credential_status", ["active", "expired", "invalid"]);
```

- [ ] **Step 4: `packages/db/src/schema/domain.ts`**

```ts
import { pgTable, uuid, text, timestamp, jsonb, numeric, date, unique } from "drizzle-orm/pg-core";
import {
  clientStatus,
  obligationKind,
  obligationFrequency,
  obligationPeriodStatus,
  documentStatus,
  integrationProvider,
  credentialStatus,
} from "./enums.js";

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  nif: text("nif"),
  email: text("email"),
  status: clientStatus("status").notNull().default("active"),
  toconlineRef: text("toconline_ref"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const obligations = pgTable("obligations", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  kind: obligationKind("kind").notNull(),
  frequency: obligationFrequency("frequency").notNull().default("monthly"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const obligationPeriods = pgTable(
  "obligation_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    obligationId: uuid("obligation_id")
      .notNull()
      .references(() => obligations.id, { onDelete: "cascade" }),
    period: text("period").notNull(),
    status: obligationPeriodStatus("status").notNull().default("pending"),
    dueDate: date("due_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("obligation_period_uq").on(t.obligationId, t.period)],
);

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  obligationPeriodId: uuid("obligation_period_id")
    .notNull()
    .references(() => obligationPeriods.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  entity: text("entity"),
  reference: text("reference"),
  amount: numeric("amount", { precision: 12, scale: 2 }),
  validUntil: date("valid_until"),
  storagePath: text("storage_path"),
  status: documentStatus("status").notNull().default("extracted"),
  extractedAt: timestamp("extracted_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const integrationCredentials = pgTable("integration_credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
  provider: integrationProvider("provider").notNull(),
  username: text("username"),
  secretEncrypted: text("secret_encrypted"),
  status: credentialStatus("status").notNull().default("active"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 5: `index.ts` re-exporta domínio**

Adicionar linha:

```ts
export * from "./domain.js";
```

- [ ] **Step 6: Gerar migration + RLS de domínio**

Run: `pnpm db:generate`

Depois criar `supabase/migrations/<ts>_domain_rls.sql`:

```sql
alter table public.clients enable row level security;
alter table public.obligations enable row level security;
alter table public.obligation_periods enable row level security;
alter table public.documents enable row level security;
alter table public.integration_credentials enable row level security;

create policy "read_clients"     on public.clients     for select to authenticated using (true);
create policy "read_obligations" on public.obligations for select to authenticated using (true);
create policy "read_periods"     on public.obligation_periods for select to authenticated using (true);
create policy "read_documents"   on public.documents   for select to authenticated using (true);

-- Credenciais: apenas admin lê (dados sensíveis; RGPD). Worker usa service role (bypass).
create policy "admin_read_credentials" on public.integration_credentials for select to authenticated
  using (public.current_app_role() = 'admin');
```

- [ ] **Step 7: Aplicar e testar**

Run:

```bash
pnpm db:reset
pnpm --filter @toc/db test
```

Expected: PASS (backbone + domain).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(db): domain skeleton (clients, obligations, periods, documents, credentials) + RLS"
```

---

## Task 5: `packages/core` — biblioteca de observabilidade (Tracer/Logger) via TDD

**Files:**

- Create: `packages/core/package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `src/observability/{types.ts,store.ts,tracer.ts,logger.ts,index.ts}`, `src/index.ts`
- Create: `test/tracer.test.ts`, `test/logger.test.ts`

**Interfaces:**

- Consumes: `@toc/db` (`createDb`, `schema.traces/events/logs`).
- Produces:
  - `interface ObservabilityStore` com `saveTrace/updateTrace/saveEvent/updateEvent/saveLog`.
  - `class InMemoryStore implements ObservabilityStore` (para testes).
  - `class DbStore implements ObservabilityStore` (produção, usa `Database`).
  - `createTracer(store): Tracer`; `Tracer.startTrace(input): Promise<TraceHandle>`.
  - `TraceHandle`: `id`, `event(input): Promise<EventHandle>`, `complete()`, `fail(error)`.
  - `EventHandle`: `id`, `child(input): Promise<EventHandle>`, `succeed(opts?)`, `fail(error)`, `skip(reason)`, `log: Logger`.
  - `Logger`: `debug/info/warn/error(message, data?)`.

- [ ] **Step 1: `packages/core/package.json`**

```json
{
  "name": "@toc/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts", "./observability": "./src/observability/index.ts" },
  "scripts": { "test": "vitest run", "typecheck": "tsc --noEmit", "lint": "eslint src" },
  "dependencies": { "@toc/db": "workspace:*" },
  "devDependencies": {
    "@toc/config": "workspace:*",
    "vitest": "^2.1.0",
    "typescript": "^5.7.0",
    "eslint": "^9.17.0"
  }
}
```

- [ ] **Step 2: `tsconfig.json` e `vitest.config.ts`**

`tsconfig.json`:

```json
{
  "extends": "@toc/config/tsconfig",
  "compilerOptions": { "outDir": "dist", "rootDir": "." },
  "include": ["src", "test"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node", include: ["test/**/*.test.ts"] } });
```

- [ ] **Step 3: Escrever `test/tracer.test.ts` (falha primeiro)**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTracer, InMemoryStore } from "../src/observability/index.js";

let store: InMemoryStore;
beforeEach(() => {
  store = new InMemoryStore();
});

describe("tracer", () => {
  it("cria um trace aberto com o gatilho informado", async () => {
    const tracer = createTracer(store);
    const trace = await tracer.startTrace({ rootTrigger: "webhook", triggerSource: "/hook" });
    expect(store.traces.get(trace.id)?.status).toBe("open");
    expect(store.traces.get(trace.id)?.rootTrigger).toBe("webhook");
  });

  it("liga event ao trace e child ao parent (árvore causal)", async () => {
    const tracer = createTracer(store);
    const trace = await tracer.startTrace({ rootTrigger: "manual" });
    const parent = await trace.event({ type: "a", source: "test" });
    const child = await parent.child({ type: "b", source: "test" });
    expect(store.events.get(parent.id)?.traceId).toBe(trace.id);
    expect(store.events.get(child.id)?.parentEventId).toBe(parent.id);
    expect(store.events.get(child.id)?.traceId).toBe(trace.id);
  });

  it("succeed/fail/skip mudam o status do event", async () => {
    const tracer = createTracer(store);
    const trace = await tracer.startTrace({ rootTrigger: "system" });
    const e1 = await trace.event({ type: "ok", source: "t" });
    await e1.succeed({ durationMs: 5 });
    const e2 = await trace.event({ type: "bad", source: "t" });
    await e2.fail({ message: "boom" });
    const e3 = await trace.event({ type: "none", source: "t" });
    await e3.skip("documento inexistente");
    expect(store.events.get(e1.id)?.status).toBe("succeeded");
    expect(store.events.get(e1.id)?.durationMs).toBe(5);
    expect(store.events.get(e2.id)?.status).toBe("failed");
    expect(store.events.get(e3.id)?.status).toBe("skipped");
  });

  it("complete()/fail() fecham o trace", async () => {
    const tracer = createTracer(store);
    const t1 = await tracer.startTrace({ rootTrigger: "manual" });
    await t1.complete();
    const t2 = await tracer.startTrace({ rootTrigger: "manual" });
    await t2.fail({ message: "x" });
    expect(store.traces.get(t1.id)?.status).toBe("completed");
    expect(store.traces.get(t2.id)?.status).toBe("failed");
    expect(store.traces.get(t1.id)?.endedAt).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 4: `test/logger.test.ts` (falha primeiro)**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTracer, InMemoryStore } from "../src/observability/index.js";

let store: InMemoryStore;
beforeEach(() => {
  store = new InMemoryStore();
});

describe("logger", () => {
  it("grava logs ligados ao trace e ao event", async () => {
    const trace = await createTracer(store).startTrace({ rootTrigger: "manual" });
    const evt = await trace.event({ type: "x", source: "t" });
    await evt.log.info("mensagem", { k: 1 });
    await evt.log.error("falhou", { code: "E1" });
    const logs = [...store.logs.values()];
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatchObject({
      traceId: trace.id,
      eventId: evt.id,
      level: "info",
      message: "mensagem",
    });
    expect(logs[1]).toMatchObject({ level: "error", data: { code: "E1" } });
  });
});
```

- [ ] **Step 5: Rodar — deve falhar**

Run: `pnpm --filter @toc/core test`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 6: `src/observability/types.ts`**

```ts
export type TriggerKind = "webhook" | "schedule" | "manual" | "system";
export type TraceStatus = "open" | "completed" | "failed";
export type EventStatus = "pending" | "in_progress" | "succeeded" | "failed" | "skipped";
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface TraceRecord {
  id: string;
  rootTrigger: TriggerKind;
  triggerSource?: string | null;
  correlationKey?: string | null;
  status: TraceStatus;
  createdBy?: string | null;
  startedAt: Date;
  endedAt?: Date | null;
}
export interface EventRecord {
  id: string;
  traceId: string;
  parentEventId?: string | null;
  type: string;
  source: string;
  status: EventStatus;
  payload: Record<string, unknown>;
  error?: unknown;
  occurredAt: Date;
  durationMs?: number | null;
}
export interface LogRecord {
  id: string;
  traceId: string;
  eventId?: string | null;
  level: LogLevel;
  message: string;
  data: Record<string, unknown>;
  loggedAt: Date;
}
export interface StartTraceInput {
  rootTrigger: TriggerKind;
  triggerSource?: string;
  correlationKey?: string;
  createdBy?: string;
}
export interface EventInput {
  type: string;
  source: string;
  payload?: Record<string, unknown>;
}
export interface ErrorInput {
  message: string;
  [k: string]: unknown;
}
```

- [ ] **Step 7: `src/observability/store.ts`**

```ts
import type { Database } from "@toc/db";
import { schema } from "@toc/db";
import type { EventRecord, LogRecord, TraceRecord } from "./types.js";

export interface ObservabilityStore {
  saveTrace(t: TraceRecord): Promise<void>;
  updateTrace(id: string, patch: Partial<TraceRecord>): Promise<void>;
  saveEvent(e: EventRecord): Promise<void>;
  updateEvent(id: string, patch: Partial<EventRecord>): Promise<void>;
  saveLog(l: LogRecord): Promise<void>;
  newId(): string;
}

export class InMemoryStore implements ObservabilityStore {
  traces = new Map<string, TraceRecord>();
  events = new Map<string, EventRecord>();
  logs = new Map<string, LogRecord>();
  private seq = 0;
  newId() {
    return `id-${++this.seq}`;
  }
  async saveTrace(t: TraceRecord) {
    this.traces.set(t.id, { ...t });
  }
  async updateTrace(id: string, patch: Partial<TraceRecord>) {
    this.traces.set(id, { ...this.traces.get(id)!, ...patch });
  }
  async saveEvent(e: EventRecord) {
    this.events.set(e.id, { ...e });
  }
  async updateEvent(id: string, patch: Partial<EventRecord>) {
    this.events.set(id, { ...this.events.get(id)!, ...patch });
  }
  async saveLog(l: LogRecord) {
    this.logs.set(l.id, { ...l });
  }
}

export class DbStore implements ObservabilityStore {
  constructor(private db: Database) {}
  newId() {
    return crypto.randomUUID();
  }
  async saveTrace(t: TraceRecord) {
    await this.db.insert(schema.traces).values({
      id: t.id,
      rootTrigger: t.rootTrigger,
      triggerSource: t.triggerSource ?? null,
      correlationKey: t.correlationKey ?? null,
      status: t.status,
      createdBy: t.createdBy ?? null,
      startedAt: t.startedAt,
    });
  }
  async updateTrace(id: string, patch: Partial<TraceRecord>) {
    const { eq } = await import("drizzle-orm");
    await this.db
      .update(schema.traces)
      .set({ status: patch.status, endedAt: patch.endedAt ?? null })
      .where(eq(schema.traces.id, id));
  }
  async saveEvent(e: EventRecord) {
    await this.db.insert(schema.events).values({
      id: e.id,
      traceId: e.traceId,
      parentEventId: e.parentEventId ?? null,
      type: e.type,
      source: e.source,
      status: e.status,
      payload: e.payload,
      occurredAt: e.occurredAt,
    });
  }
  async updateEvent(id: string, patch: Partial<EventRecord>) {
    const { eq } = await import("drizzle-orm");
    await this.db
      .update(schema.events)
      .set({
        status: patch.status,
        error: patch.error ?? null,
        durationMs: patch.durationMs ?? null,
      })
      .where(eq(schema.events.id, id));
  }
  async saveLog(l: LogRecord) {
    await this.db.insert(schema.logs).values({
      id: l.id,
      traceId: l.traceId,
      eventId: l.eventId ?? null,
      level: l.level,
      message: l.message,
      data: l.data,
      loggedAt: l.loggedAt,
    });
  }
}
```

- [ ] **Step 8: `src/observability/logger.ts`**

```ts
import type { LogLevel } from "./types.js";
import type { ObservabilityStore } from "./store.js";

export class Logger {
  constructor(
    private store: ObservabilityStore,
    private traceId: string,
    private eventId?: string,
  ) {}
  private async write(level: LogLevel, message: string, data: Record<string, unknown> = {}) {
    const rec = {
      id: this.store.newId(),
      traceId: this.traceId,
      eventId: this.eventId,
      level,
      message,
      data,
      loggedAt: new Date(),
    };
    // eslint-disable-next-line no-console
    console[level === "debug" ? "log" : level](
      JSON.stringify({ traceId: this.traceId, eventId: this.eventId, level, message, ...data }),
    );
    await this.store.saveLog(rec);
  }
  debug(m: string, d?: Record<string, unknown>) {
    return this.write("debug", m, d);
  }
  info(m: string, d?: Record<string, unknown>) {
    return this.write("info", m, d);
  }
  warn(m: string, d?: Record<string, unknown>) {
    return this.write("warn", m, d);
  }
  error(m: string, d?: Record<string, unknown>) {
    return this.write("error", m, d);
  }
}
```

- [ ] **Step 9: `src/observability/tracer.ts`**

```ts
import type { ObservabilityStore } from "./store.js";
import { Logger } from "./logger.js";
import type { EventInput, ErrorInput, StartTraceInput } from "./types.js";

export class EventHandle {
  readonly log: Logger;
  constructor(
    private store: ObservabilityStore,
    readonly id: string,
    readonly traceId: string,
  ) {
    this.log = new Logger(store, traceId, id);
  }
  async child(input: EventInput): Promise<EventHandle> {
    return createEvent(this.store, this.traceId, input, this.id);
  }
  async succeed(opts?: { durationMs?: number }) {
    await this.store.updateEvent(this.id, {
      status: "succeeded",
      durationMs: opts?.durationMs ?? null,
    });
  }
  async fail(error: ErrorInput) {
    await this.store.updateEvent(this.id, { status: "failed", error });
  }
  async skip(reason: string) {
    await this.store.updateEvent(this.id, { status: "skipped", error: { reason } });
  }
}

async function createEvent(
  store: ObservabilityStore,
  traceId: string,
  input: EventInput,
  parentEventId?: string,
) {
  const id = store.newId();
  await store.saveEvent({
    id,
    traceId,
    parentEventId,
    type: input.type,
    source: input.source,
    status: "in_progress",
    payload: input.payload ?? {},
    occurredAt: new Date(),
  });
  return new EventHandle(store, id, traceId);
}

export class TraceHandle {
  readonly log: Logger;
  constructor(
    private store: ObservabilityStore,
    readonly id: string,
  ) {
    this.log = new Logger(store, id);
  }
  event(input: EventInput) {
    return createEvent(this.store, this.id, input);
  }
  async complete() {
    await this.store.updateTrace(this.id, { status: "completed", endedAt: new Date() });
  }
  async fail(_error: ErrorInput) {
    await this.store.updateTrace(this.id, { status: "failed", endedAt: new Date() });
  }
}

export interface Tracer {
  startTrace(input: StartTraceInput): Promise<TraceHandle>;
}

export function createTracer(store: ObservabilityStore): Tracer {
  return {
    async startTrace(input) {
      const id = store.newId();
      await store.saveTrace({
        id,
        rootTrigger: input.rootTrigger,
        triggerSource: input.triggerSource,
        correlationKey: input.correlationKey,
        createdBy: input.createdBy,
        status: "open",
        startedAt: new Date(),
      });
      return new TraceHandle(store, id);
    },
  };
}
```

- [ ] **Step 10: `src/observability/index.ts` e `src/index.ts`**

`src/observability/index.ts`:

```ts
export * from "./types.js";
export * from "./store.js";
export * from "./logger.js";
export * from "./tracer.js";
```

`src/index.ts`:

```ts
export * as observability from "./observability/index.js";
export { createTracer, InMemoryStore, DbStore, Logger } from "./observability/index.js";
```

- [ ] **Step 11: Rodar — deve passar**

Run: `pnpm --filter @toc/core test`
Expected: PASS (tracer + logger).

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat(core): observability tracer/logger with TDD (in-memory + db store)"
```

---

## Task 6: `apps/web` — Next.js + Supabase Auth (login/logout + rota protegida)

**Files:**

- Create: `apps/web/package.json`, `tsconfig.json`, `next.config.ts`, `middleware.ts`
- Create: `src/lib/supabase/{server.ts,client.ts,middleware.ts}`, `src/lib/auth.ts`
- Create: `src/app/{layout.tsx,page.tsx}`, `src/app/login/{page.tsx,actions.ts}`
- Create: `playwright.config.ts`, `e2e/login.spec.ts`

**Interfaces:**

- Consumes: envs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Produces: helpers `getSupabaseServerClient()`, `getSessionUser()`, `requireRole(role)`.

- [ ] **Step 1: Scaffold Next.js**

Run:

```bash
pnpm dlx create-next-app@latest apps/web --ts --app --eslint --no-tailwind --src-dir --import-alias "@/*" --use-pnpm --no-turbopack --yes
```

Expected: cria `apps/web`. (Remova quaisquer devDeps duplicadas de ESLint que colidam com o preset raiz; mantenha o `eslint.config.js` reexportando `@toc/config/eslint`.)

- [ ] **Step 2: Adicionar deps do Supabase e `@toc/*`**

Run:

```bash
pnpm --filter web add @supabase/supabase-js @supabase/ssr
pnpm --filter web add "@toc/db@workspace:*" "@toc/core@workspace:*" "@toc/config@workspace:*"
```

- [ ] **Step 3: `src/lib/supabase/server.ts`**

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function getSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) =>
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    },
  );
}
```

- [ ] **Step 4: `src/lib/supabase/middleware.ts` e `middleware.ts`**

`src/lib/supabase/middleware.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) =>
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
      },
    },
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  if (!user && !path.startsWith("/login")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return response;
}
```

`middleware.ts` (raiz de `apps/web`):

```ts
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
export async function middleware(request: NextRequest) {
  return updateSession(request);
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
```

- [ ] **Step 5: `src/lib/auth.ts`**

```ts
import { getSupabaseServerClient } from "./supabase/server";

export type AppRole = "admin" | "operator" | "viewer";

export async function getSessionUser() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, email, full_name")
    .eq("id", user.id)
    .single();
  return { id: user.id, email: user.email, role: (profile?.role ?? "viewer") as AppRole };
}

export async function requireRole(min: AppRole) {
  const order: AppRole[] = ["viewer", "operator", "admin"];
  const user = await getSessionUser();
  if (!user || order.indexOf(user.role) < order.indexOf(min)) return null;
  return user;
}
```

- [ ] **Step 6: `src/app/login/actions.ts` e `login/page.tsx`**

`actions.ts`:

```ts
"use server";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function signIn(formData: FormData) {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });
  if (error) redirect("/login?error=1");
  redirect("/traces");
}

export async function signOut() {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
```

`login/page.tsx`:

```tsx
import { signIn } from "./actions";

export default function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <main style={{ maxWidth: 320, margin: "80px auto" }}>
      <h1>Entrar</h1>
      <form action={signIn} style={{ display: "grid", gap: 8 }}>
        <input name="email" type="email" placeholder="email" required aria-label="email" />
        <input name="password" type="password" placeholder="senha" required aria-label="senha" />
        <button type="submit">Entrar</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 7: `src/app/layout.tsx` e `page.tsx`**

`layout.tsx`:

```tsx
export const metadata = { title: "Automação TOConline" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <body>{children}</body>
    </html>
  );
}
```

`page.tsx`:

```tsx
import { redirect } from "next/navigation";
export default function Home() {
  redirect("/traces");
}
```

- [ ] **Step 8: `playwright.config.ts` e `e2e/login.spec.ts`**

`playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
  use: { baseURL: "http://localhost:3000" },
});
```

`e2e/login.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("visitante não autenticado é redirecionado para /login", async ({ page }) => {
  await page.goto("/traces");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
});
```

Adicionar em `apps/web/package.json` scripts: `"test": "playwright test"`, `"test:e2e": "playwright test"`, `"dev": "next dev"`, `"build": "next build"`, `"typecheck": "tsc --noEmit"`.

Run: `pnpm --filter web exec playwright install --with-deps chromium`

- [ ] **Step 9: Rodar o e2e**

Run: `pnpm --filter web test`
Expected: PASS (redireciona para /login).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(web): next.js app + supabase auth (login/logout, protected routes)"
```

---

## Task 7: `apps/web` — página de observabilidade (traces, read-only, role-gated)

**Files:**

- Create: `src/app/(dashboard)/traces/page.tsx`
- Modify: `src/app/login/actions.ts` (já tem signOut)
- Create: `e2e/traces.spec.ts` (opcional de fumaça — ver passo)

**Interfaces:**

- Consumes: `getSessionUser()`, Supabase server client (lê `traces`).
- Produces: rota `/traces` que lista os traces mais recentes.

- [ ] **Step 1: `traces/page.tsx`**

```tsx
import { getSessionUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { signOut } from "@/app/login/actions";

export default async function TracesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const supabase = await getSupabaseServerClient();
  const { data: traces } = await supabase
    .from("traces")
    .select("id, root_trigger, status, started_at")
    .order("started_at", { ascending: false })
    .limit(50);

  return (
    <main style={{ maxWidth: 900, margin: "40px auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between" }}>
        <h1>Traces</h1>
        <form action={signOut}>
          <span>
            {user.email} ({user.role})
          </span>{" "}
          <button>Sair</button>
        </form>
      </header>
      <table>
        <thead>
          <tr>
            <th>Gatilho</th>
            <th>Status</th>
            <th>Início</th>
          </tr>
        </thead>
        <tbody>
          {(traces ?? []).map((t) => (
            <tr key={t.id}>
              <td>{t.root_trigger}</td>
              <td>{t.status}</td>
              <td>{t.started_at}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 2: Verificar build + typecheck**

Run:

```bash
pnpm --filter web typecheck
pnpm --filter web build
```

Expected: build conclui sem erros de tipo.

- [ ] **Step 3: Verificação manual (documentada)**

Run: `pnpm --filter web dev`, criar um usuário via `supabase` Studio (http://127.0.0.1:54323) → Auth, logar em `/login`, ver `/traces` vazio.
Expected: login funciona, página renderiza.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(web): read-only traces observability page (role-aware)"
```

---

## Task 8: `apps/worker` — scaffold (stub)

**Files:**

- Create: `apps/worker/package.json`, `tsconfig.json`, `README.md`, `src/index.ts`

**Interfaces:**

- Produces: nada consumível ainda — apenas estrutura pronta para a feature de RPA.

- [ ] **Step 1: `apps/worker/package.json`**

```json
{
  "name": "@toc/worker",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --watch --experimental-strip-types src/index.ts",
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src",
    "test": "echo \"(worker: sem testes ainda)\" && exit 0"
  },
  "dependencies": { "@toc/db": "workspace:*", "@toc/core": "workspace:*" },
  "devDependencies": { "@toc/config": "workspace:*", "typescript": "^5.7.0", "eslint": "^9.17.0" }
}
```

- [ ] **Step 2: `tsconfig.json`**

```json
{
  "extends": "@toc/config/tsconfig",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

- [ ] **Step 3: `src/index.ts` (entrypoint vazio, documentado)**

```ts
// Worker de RPA (Node + Playwright). SCAFFOLD — implementado em feature futura.
// Responsabilidade futura: consumir a tabela `jobs` (SELECT ... FOR UPDATE SKIP LOCKED),
// executar a automação de browser e registrar tudo via @toc/core (Tracer/Logger).
async function main() {
  console.log("[worker] scaffold — nenhuma automação implementada ainda.");
}
main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
```

- [ ] **Step 4: `README.md`**

```markdown
# @toc/worker (scaffold)

Worker persistente de RPA (Node + Playwright). Ainda **não implementado**.
Consumirá a fila `jobs`, executará a automação dos portais e registrará via `@toc/core`.
Roda fora da Vercel (Fly.io / Railway / container), pois exige processo de longa duração.
```

- [ ] **Step 5: Verificar typecheck e commit**

Run: `pnpm --filter @toc/worker typecheck`
Expected: PASS.

```bash
git add -A
git commit -m "chore(worker): scaffold worker package (stub)"
```

---

## Task 9: CI + PR template + documentação de IA

**Files:**

- Create: `.github/workflows/ci.yml`, `.github/pull_request_template.md`
- Create: `CLAUDE.md`, `README.md`
- Create: `docs/architecture.md`, `docs/event-logging.md`, `docs/database.md`, `docs/local-development.md`, `docs/conventions.md`

**Interfaces:** nenhum código consumível — encerra a base.

- [ ] **Step 1: `.github/workflows/ci.yml`**

```yaml
name: CI
on:
  pull_request:
  push: { branches: [main] }
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
```

> Nota: tarefas de `test` que exigem Postgres (`@toc/db`) devem ser marcadas para rodar só localmente ou com um serviço Postgres no CI. Para esta base, o `@toc/db` test roda localmente; no CI, considere adicionar um `services: postgres` em iteração futura. `@toc/core` roda com `InMemoryStore` (sem DB) e passa no CI.

- [ ] **Step 2: `.github/pull_request_template.md`**

```markdown
## O que muda

## Por quê

## Como testar

## Checklist

- [ ] TDD: testes escritos antes / cobrindo a mudança
- [ ] `pnpm lint && pnpm typecheck && pnpm test` verdes localmente
- [ ] Migrations (se houver) geradas via `pnpm db:generate` e aplicadas com `pnpm db:reset`
- [ ] Sem segredos commitados
- [ ] Docs atualizadas quando necessário
```

- [ ] **Step 3: `CLAUDE.md`** (conteúdo literal)

```markdown
# CLAUDE.md — Automação de Guias Fiscais (TOConline)

Monorepo pnpm+Turborepo. `apps/web` (Next.js → Vercel), `apps/worker` (RPA Node+Playwright, scaffold), `packages/{db,core,config}`. Supabase = Postgres (verdade) + Auth + Storage.

## Comandos essenciais

- `pnpm install` — instala tudo
- `pnpm db:start` / `pnpm db:stop` — sobe/derruba Supabase local (Docker)
- `pnpm db:reset` — recria o BD e aplica migrations + seed (à parte do dev)
- `pnpm db:generate` — drizzle-kit gera SQL de migration a partir do schema TS
- `pnpm dev` — sobe apps em dev
- `pnpm test` / `pnpm lint` / `pnpm typecheck` — via turbo

## Regras de trabalho

- **TDD sempre**: red → green → refactor (Vitest; Playwright p/ e2e).
- **Feature branches**: branch a partir de `main` → PR → review → merge.
- **Schema**: fonte da verdade em `packages/db/src/schema/*`; nunca edite SQL de migration à mão exceto para RLS/policies/triggers.
- **Observabilidade**: todo fluxo com efeito colateral cria um `trace` e encadeia `events`/`logs` via `@toc/core`.
- **RLS ligado**: worker usa service role; dashboard respeita `profiles.role`.
- **Segredos**: só em `.env` (nunca commitado). Base tem `.env.example`.

## Mapa da documentação

- `docs/context/project-context.md` — contexto de domínio
- `docs/architecture.md` — arquitetura
- `docs/event-logging.md` — modelo de traces/events/logs
- `docs/database.md` — schema e migrations
- `docs/local-development.md` — setup local
- `docs/conventions.md` — convenções de código/commits
- `docs/superpowers/specs|plans/` — specs e planos
```

- [ ] **Step 4: `README.md`**

````markdown
# Automação de Guias Fiscais (TOConline)

Sistema de automação (RPA) + orquestração + dashboard para o ciclo mensal de guias fiscais de um gabinete de contabilidade português. Ver `docs/context/project-context.md`.

## Setup rápido

```bash
pnpm install
pnpm db:start          # Supabase local (Docker)
cp .env.example .env   # preencher com o output de `supabase status`
pnpm db:reset          # aplica migrations + seed
pnpm dev               # sobe o dashboard
```
````

Requisitos: Node 24, pnpm 9, Docker, Supabase CLI.

````

- [ ] **Step 5: docs restantes** (conteúdo literal resumido)

`docs/architecture.md`, `docs/event-logging.md`, `docs/database.md`, `docs/local-development.md`, `docs/conventions.md` — cada um descrevendo, respectivamente: os deployables e fronteiras; o modelo trace→event→log e a API do `@toc/core`; as tabelas e o fluxo drizzle→supabase; passos de `db:start`/`.env`/`db:reset`/`dev`; e Conventional Commits + TDD + fluxo de branches. (Derivar do spec `docs/superpowers/specs/2026-07-06-project-foundation-design.md`.)

- [ ] **Step 6: Verificação final do repo inteiro**

Run:
```bash
pnpm install
pnpm lint && pnpm typecheck
pnpm db:reset && pnpm test
pnpm --filter web build
````

Expected: tudo verde; build do web conclui.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: CI, PR template, CLAUDE.md e docs de IA"
```

---

## Task 10: Abrir o Pull Request

- [ ] **Step 1: Push da branch**

Run:

```bash
git push -u origin feat/project-foundation
```

(Se não houver remoto configurado, pausar e pedir ao usuário o remoto/GitHub.)

- [ ] **Step 2: Abrir PR**

Run:

```bash
gh pr create --base main --head feat/project-foundation \
  --title "feat: base do projeto (monorepo, BD, observabilidade, auth, docs)" \
  --body "Base fundacional conforme docs/superpowers/specs/2026-07-06-project-foundation-design.md"
```

Expected: PR criado para review da equipe.

---

## Self-Review

**1. Spec coverage:**

- §2 arquitetura (monorepo, 2 deployables, fila jobs) → Tasks 1, 6, 8, schema jobs (Task 3). ✓
- §3 stack → Tasks 1–6. ✓
- §4 estrutura de pastas → Tasks 1–9. ✓
- §5.1 auth/profiles → Task 3. §5.2 observability → Task 3. §5.3 jobs → Task 3. §5.4 domínio → Task 4. ✓
- §6 sistema de eventos correlacionados (Tracer/Logger, TDD) → Task 5. ✓
- §7 auth/autorização (Supabase Auth + RLS + roles) → Tasks 3 (RLS/roles), 6 (auth), 7 (role-aware). ✓
- §8 fluxo dev (TDD, branches, CI, migrations à parte) → Tasks 0, 1, 2, 9. ✓
- §9 documentação de IA → Task 9. ✓
- §10 fora de escopo respeitado (worker só scaffold; sem crypto de credenciais; sem features) → Task 8, colunas em Task 4. ✓

**2. Placeholder scan:** Task 9 Step 5 resume o conteúdo dos 5 docs em vez de transcrevê-los; é conteúdo descritivo derivável do spec, não lógica — aceitável, mas o implementador deve escrever cada doc com base no spec citado. Nenhum "TODO/TBD" em código.

**3. Type consistency:** nomes de tabelas/colunas do `@toc/db` (camelCase Drizzle) usados consistentemente em `@toc/core` `DbStore` (Task 5) e nas queries `apps/web` (snake_case via supabase-js, Tasks 6–7, correto pois supabase-js usa nomes de coluna do Postgres). API do Tracer (`startTrace/event/child/succeed/fail/skip/complete/log`) consistente entre types (Task 5 Interfaces), testes (Steps 3–4) e implementação (Step 9). ✓

```

```
