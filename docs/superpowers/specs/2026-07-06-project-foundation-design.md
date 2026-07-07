# Design — Base do Projeto: Automação de Guias Fiscais (TOConline)

- **Data:** 2026-07-06
- **Estado:** Aprovado (design). Base fundacional, sem features de negócio.
- **Contexto de origem:** `docs/context/project-context.md` (contexto de domínio).

> Este documento especifica **apenas a base** do projeto — repositório, arquitetura,
> stack, banco de dados (backbone + esqueleto de domínio), sistema de logs/eventos
> correlacionados, auth, fluxo de desenvolvimento e documentação de IA. **Nenhuma
> feature de RPA, caminho de portal ou tipo de guia é implementado aqui.** Cada
> feature futura terá seu próprio ciclo spec → plano → implementação.

---

## 1. Objetivo desta base

Entregar um monorepo pronto para desenvolvimento incremental via Claude Code, com:

- estrutura de pastas e tooling de monorepo funcionando;
- banco de dados com o **backbone operacional** (auth/roles, logs/eventos
  correlacionados, fila de jobs, credenciais) e um **esqueleto de domínio**
  extensível (clientes, obrigações, documentos);
- a **biblioteca de observabilidade** (`Tracer`/`Logger`) construída via TDD,
  pois é a espinha dorsal de depuração exigida por um sistema de integrações;
- auth/autorização básicos no dashboard;
- fluxo de dev definido (TDD, feature branches, CI, migrations);
- documentação de IA (`CLAUDE.md` + `docs/`).

Critério de sucesso: `pnpm install && pnpm db:start && pnpm db:reset && pnpm test`
roda verde; `pnpm dev` sobe o dashboard com login funcional; um desenvolvedor (ou
o Claude Code) consegue abrir o repo, ler `CLAUDE.md` e começar uma feature.

---

## 2. Arquitetura geral

Monorepo com **dois deployables** e **um Supabase** como fonte da verdade. O worker
de RPA é apenas **esboçado (scaffold)** nesta fase.

```
┌─────────────────┐     ┌──────────────────┐
│  apps/web        │     │  apps/worker      │  (SCAFFOLD ONLY nesta fase)
│  Next.js (App    │     │  Node + Playwright│
│  Router)         │     │  RPA + fila       │
│  Dashboard+API+  │     │  (implementado    │
│  Auth → Vercel   │     │   depois)         │
└────────┬─────────┘     └─────────┬────────┘
         │        packages/*        │
         │  db · core (tracer/log)  │
         └──────────┬───────────────┘
                    ▼
            ┌───────────────┐
            │   Supabase    │  Postgres (verdade) + Auth + Storage (PDFs)
            └───────────────┘
```

**Por que dois deployables:** a automação de browser (Playwright) exige processo
persistente, sessões longas, 2FA e download de PDFs — incompatível com o modelo
serverless/stateless da Vercel (limite de tempo, sem browser vivo entre passos). O
dashboard/API/auth, ao contrário, é ideal para a Vercel. Ambos compartilham código
via `packages/*` e falam com o mesmo Supabase.

**Fila:** tabela `jobs` no Postgres consumida com `SELECT … FOR UPDATE SKIP LOCKED`.
Simples e suficiente para a cadência de RPA; trocável por fila dedicada depois.

---

## 3. Stack

| Camada                  | Escolha                                               |
| ----------------------- | ----------------------------------------------------- |
| Linguagem               | TypeScript (strict)                                   |
| Package manager         | pnpm (workspaces)                                     |
| Orquestração monorepo   | Turborepo (cache de build/test/lint)                  |
| Front-end / API         | Next.js (App Router), React                           |
| Deploy web              | Vercel                                                |
| Banco                   | Supabase (Postgres) — local via Supabase CLI (Docker) |
| Acesso a dados / schema | Drizzle ORM + drizzle-kit (gera SQL das migrations)   |
| Auth                    | Supabase Auth (e-mail/senha) + RLS + roles            |
| Testes                  | Vitest (unit/integração) + Playwright (e2e)           |
| Lint/format             | ESLint (flat config) + Prettier                       |
| CI                      | GitHub Actions (lint + typecheck + test)              |
| Worker (depois)         | Node + Playwright                                     |

---

## 4. Estrutura de pastas

```
apps/
  web/                Next.js: dashboard, rotas de API, auth
  worker/             STUB: package.json + README + src/index.ts (entrypoint vazio)
packages/
  db/                 schema Drizzle, client tipado, glue de migrations, seed
  core/               tipos de domínio + biblioteca de logs/eventos (Tracer/Logger)
  config/             tsconfig base + config compartilhada de eslint/prettier
supabase/
  config.toml         config do stack local
  migrations/         SQL das migrations (saída do drizzle-kit)
  seed.sql            dados de seed para dev
docs/
  context/            project-context.md (contexto de domínio)
  architecture.md
  event-logging.md
  database.md
  local-development.md
  conventions.md
  superpowers/specs/  este design e futuros
.github/
  workflows/ci.yml
  pull_request_template.md
CLAUDE.md · README.md · .env.example · turbo.json · pnpm-workspace.yaml
package.json · tsconfig.base.json · .gitignore · .prettierrc · eslint.config.js
```

**Fronteiras (isolamento):**

- `packages/core` não depende de Next nem de detalhes do worker — só de tipos e do
  `packages/db`. É a lib de observabilidade + tipos de domínio, testável isolada.
- `packages/db` encapsula schema e client; consumidores nunca escrevem SQL solto.
- `apps/*` consomem `packages/*`, nunca o contrário.

---

## 5. Modelo de dados

Enums são **extensíveis**: começam pequenos e crescem por feature. Todas as tabelas
com `id uuid` (default `gen_random_uuid()`), `created_at`/`updated_at timestamptz`.
**RLS ligado em todas**; o worker usa a service role (bypass), o dashboard lê/escreve
conforme a role do usuário.

### 5.1 Auth / autorização

**`profiles`** — espelha `auth.users` (1:1 via `id`).

- `id uuid PK` (= `auth.users.id`)
- `email text`
- `role app_role NOT NULL DEFAULT 'viewer'`
- `full_name text`, `created_at`, `updated_at`

Enum `app_role`: `admin` | `operator` | `viewer`.

- `viewer`: só leitura (logs/estado).
- `operator`: opera (reprocessa jobs, dispara execuções).
- `admin`: tudo, inclui gerir credenciais e usuários.

Trigger `on auth.users insert` cria a `profiles` correspondente com role padrão.

### 5.2 Observabilidade / eventos correlacionados

**`traces`** — contexto-raiz por gatilho inicial.

- `id uuid PK`
- `root_trigger trigger_kind NOT NULL` — `webhook` | `schedule` | `manual` | `system`
- `trigger_source text` — ex.: rota do webhook, nome do cron, ação do usuário
- `correlation_key text NULL` — chave de negócio p/ agrupar (ex.: `client:UUID:period:2026-06`)
- `status trace_status NOT NULL DEFAULT 'open'` — `open` | `completed` | `failed`
- `metadata jsonb NOT NULL DEFAULT '{}'`
- `created_by uuid NULL` (→ `profiles.id`)
- `started_at`, `ended_at NULL`

**`events`** — árvore causal de acontecimentos dentro de um trace.

- `id uuid PK`
- `trace_id uuid NOT NULL` (→ `traces.id`, on delete cascade)
- `parent_event_id uuid NULL` (→ `events.id`) — forma a árvore gatilho→filhos
- `type text NOT NULL` — ex.: `webhook.received`, `job.enqueued`, `rpa.step`
- `source text NOT NULL` — componente/serviço emissor (`web`, `worker`, etc.)
- `status event_status NOT NULL DEFAULT 'pending'` — `pending` | `in_progress` | `succeeded` | `failed` | `skipped`
- `payload jsonb NOT NULL DEFAULT '{}'`
- `error jsonb NULL`
- `occurred_at timestamptz NOT NULL`
- `duration_ms integer NULL`
- Índices: `(trace_id)`, `(parent_event_id)`, `(type)`, `(occurred_at)`.

**`logs`** — linhas finas penduradas num event (e no trace).

- `id uuid PK`
- `trace_id uuid NOT NULL` (→ `traces.id`, cascade)
- `event_id uuid NULL` (→ `events.id`, cascade)
- `level log_level NOT NULL` — `debug` | `info` | `warn` | `error`
- `message text NOT NULL`
- `data jsonb NOT NULL DEFAULT '{}'`
- `logged_at timestamptz NOT NULL`
- Índices: `(trace_id)`, `(event_id)`, `(level)`.

### 5.3 Orquestração

**`jobs`** — fila DB-backed.

- `id uuid PK`
- `trace_id uuid NULL` (→ `traces.id`) — contexto de origem
- `triggering_event_id uuid NULL` (→ `events.id`)
- `type text NOT NULL`
- `status job_status NOT NULL DEFAULT 'pending'` — `pending` | `running` | `succeeded` | `failed` | `skipped` | `cancelled`
- `payload jsonb NOT NULL DEFAULT '{}'`
- `result jsonb NULL`
- `attempts integer NOT NULL DEFAULT 0`
- `max_attempts integer NOT NULL DEFAULT 3`
- `scheduled_for timestamptz NOT NULL DEFAULT now()`
- `started_at NULL`, `finished_at NULL`
- `last_error jsonb NULL`
- Índice parcial p/ o consumidor: `(status, scheduled_for)` where `status = 'pending'`.

`skipped` cobre "documento inexistente" (resultado válido, não erro).

### 5.4 Esqueleto de domínio

**`clients`** — empresas do gabinete.

- `id`, `name text NOT NULL`, `nif text` (NIF/tax id), `email text`,
  `status client_status NOT NULL DEFAULT 'active'` (`active` | `inactive`),
  `toconline_ref text NULL`, `metadata jsonb`.

**`obligations`** — obrigação recorrente por cliente.

- `id`, `client_id uuid NOT NULL` (→ `clients.id`, cascade),
  `kind obligation_kind NOT NULL`, `frequency obligation_frequency NOT NULL DEFAULT 'monthly'`,
  `metadata jsonb`.
- `obligation_kind` (inicial, extensível): `iva` | `irs_retencao` | `dmr` | `ss_contribuicoes` | `other`.
- `obligation_frequency`: `monthly` | `quarterly` | `annual` | `other`.

**`obligation_periods`** — estado por **cliente × obrigação × período**.

- `id`, `obligation_id uuid NOT NULL` (→ `obligations.id`, cascade),
  `period text NOT NULL` (ex.: `2026-06`),
  `status obligation_period_status NOT NULL DEFAULT 'pending'`,
  `due_date date NULL`.
- Status: `pending` | `in_progress` | `delivered` | `paid` | `skipped_nonexistent` | `error` | `not_applicable`.
- Unique `(obligation_id, period)` — idempotência (não repetir período já feito).

**`documents`** — as guias de pagamento.

- `id`, `obligation_period_id uuid NOT NULL` (→ cascade),
  `type text NOT NULL`, `entity text NULL` (entidade), `reference text NULL` (referência),
  `amount numeric(12,2) NULL`, `valid_until date NULL` (**só SS**),
  `storage_path text NULL` (PDF no Supabase Storage),
  `status document_status NOT NULL DEFAULT 'extracted'` (`extracted` | `sent` | `error`),
  `extracted_at NULL`, `sent_at NULL`, `metadata jsonb`.

**`integration_credentials`** — acesso por cliente/provider.

- `id`, `client_id uuid NULL` (→ `clients.id`), `provider integration_provider NOT NULL`
  (`toconline` | `at` | `seguranca_social` | `efatura`),
  `username text NULL`, `secret_encrypted text NULL` (**criptografado em repouso**),
  `status credential_status NOT NULL DEFAULT 'active'` (`active` | `expired` | `invalid`),
  `expires_at timestamptz NULL`, `last_verified_at timestamptz NULL`.
- Modela "senha da SS expira com frequência" (`status`/`expires_at`) e o utilizador
  dedicado por cliente.
- **Criptografia:** decisão documentada, **não implementada** nesta base. Alvo:
  Supabase Vault / `pgsodium` (preferido) ou cifra a nível de app (AES-GCM com chave
  em KMS). A coluna existe; o mecanismo entra com a feature de credenciais. RLS
  restringe leitura a `admin` + service role.

---

## 6. Sistema de logs/eventos correlacionados (detalhe)

Modelo inspirado em _distributed tracing_, persistido no Postgres, para reconstruir
"de um webhook/evento inicial até o último efeito" e depurar a cadeia inteira.

- **Trace** = raiz por gatilho. **Event** = nó com `parent_event_id` → árvore causal.
  **Log** = linha fina sob um event.
- `packages/core` expõe uma API tipada:

```ts
const trace = await tracer.startTrace({ rootTrigger: "webhook", triggerSource: "/api/hooks/x" });
const evt = await trace.event({ type: "webhook.received", source: "web" });
await evt.log.info("payload validado", { size });
const child = await evt.child({ type: "job.enqueued", source: "web" });
await evt.succeed({ durationMs }); // ou evt.fail(error) / evt.skip(reason)
await trace.complete();
```

- Cada `event`/`log` grava no BD **e** emite no stdout (JSON estruturado) para
  observabilidade em runtime.
- **É a primeira coisa construída via TDD** — infraestrutura, não feature. Testes
  cobrem: criação de trace, encadeamento pai→filho, transições de status, logs
  ligados, e reconstrução da árvore de um trace.

---

## 7. Auth / autorização

- Supabase Auth (e-mail/senha). Sessão via `@supabase/ssr` no Next (App Router).
- `profiles.role` dirige a autorização: RLS por role no Postgres **e** guardas nas
  rotas/Server Components (defense in depth).
- Dashboard inicial: login/logout, página autenticada que lista traces/logs
  (somente leitura para `viewer`), e um placeholder de "operar" gated por role.
- Sem features de negócio: o dashboard prova o fluxo de auth + leitura de
  observabilidade, nada além.

---

## 8. Fluxo de desenvolvimento

- **TDD como padrão**: red → green → refactor. Vitest para unit/integração;
  Playwright para e2e do dashboard.
- **Feature branches**: branch a partir de `main` → PR → review da equipe → merge.
  Template de PR versionado; CI (GitHub Actions) roda lint + typecheck + test em cada PR.
- **Supabase local (Docker via CLI)**:
  - `pnpm db:start` → `supabase start` (sobe Postgres/Auth/Studio em Docker).
  - `pnpm db:reset` → recria e aplica todas as migrations + seed.
  - `pnpm db:migrate` → aplica migrations pendentes.
  - `pnpm db:generate` → drizzle-kit gera SQL de migration a partir do schema TS.
  - **Migrations rodam à parte do `pnpm dev`** (nunca acopladas ao boot do app).
- **Convenções**: Conventional Commits; ESLint + Prettier no CI; TypeScript strict.

---

## 9. Documentação de IA (desenvolver com Claude Code)

- **`CLAUDE.md`** (raiz): visão do projeto, arquitetura, comandos essenciais,
  convenções, workflow de TDD/branches, e mapa dos documentos em `docs/`.
- **`docs/`**: `architecture.md`, `event-logging.md`, `database.md`,
  `local-development.md`, `conventions.md`, `context/project-context.md`, e os specs
  em `docs/superpowers/specs/`.
- CLAUDE.md por app/package virá conforme cada um crescer (leve agora).

---

## 10. Fora de escopo nesta base (YAGNI)

- Qualquer automação de RPA real, caminho de portal ou tipo de guia específico.
- Agendamento pelo calendário fiscal (dias 10/17/20/25).
- Envio de e-mails/lembretes ao cliente.
- Implementação da criptografia de credenciais (só a coluna + decisão documentada).
- Integração real com TOConline/AT/SS/e-Fatura.
- O worker de RPA em si (apenas scaffold: package + README + entrypoint vazio).

Cada item acima é uma feature futura, com seu próprio ciclo spec → plano →
implementação.

---

## 11. Riscos e pontos em aberto (herdados do contexto)

- Lista completa de tipos de obrigação/documento ainda a compilar com o cliente →
  por isso enums extensíveis e esqueleto de domínio, não modelo fechado.
- Funcionamento exato do utilizador dedicado por cliente na SS e onde ficam as
  credenciais → `integration_credentials` é genérica o suficiente para acomodar.
- Como confirmar pagamento do cliente → afeta o fecho do ciclo/lembretes; fora desta base.
- Escopo exato do acesso limitado ao TOConline (sigilo/RGPD) → tratamento cuidadoso
  de credenciais desde já (RLS + criptografia planejada).

```

```
