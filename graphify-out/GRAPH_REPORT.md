# Graph Report - automacao-toc-online  (2026-07-08)

## Corpus Check
- 72 files · ~22,123 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 535 nodes · 544 edges · 111 communities (33 shown, 78 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e04a7688`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Observability Tracer/Logger
- Architecture & Domain Overview
- DB Schema (Drizzle)
- Observability Stores & DB Client
- Web App Dependencies
- DB Package Manifest
- Fiscal Domain & RLS
- Turborepo & Lint Config
- Root Package Scripts
- Web App tsconfig
- Core Package Manifest
- Worker Package Manifest
- Web Auth & Pages
- Shared Base tsconfig
- Shared Base tsconfig (variant)
- Docs, CI & PR Workflow
- Config Package Manifest
- Web Middleware & Proxy
- Package tsconfig (core)
- Package tsconfig (db)
- Package tsconfig (worker)
- Web Root Layout
- Web ESLint Config
- Next.js Config
- Next Env Types
- File Icon Asset
- Globe Icon Asset
- Next.js Logo Asset
- Vercel Logo Asset
- Window Icon Asset
- Config Package
- IRS Withholding (IRS)
- Management Dashboard (planned)
- TS Strict Convention
- Design — Base do Projeto: Automação de Guias Fiscais (TOConline)
- Base do Projeto (Automação TOConline) — Implementation Plan
- Arquitetura
- pull_request_template.md
- README.md
- @toc/worker (scaffold)
- jobs queue consumed by worker
- Worker runs off Vercel (long-running process + real browser)
- Portal automation (TOConline, AT, Segurança Social, e-Fatura)
- @toc/worker RPA worker (scaffold)
- @toc/core observability (Tracer/Logger)
- apps/web (Next.js App Router → Vercel)
- apps/worker (Node + Playwright RPA)
- Fila de trabalho (tabela jobs, FOR UPDATE SKIP LOCKED)
- Monorepo com dois deployables
- packages/core (Tracer/Logger + tipos de domínio)
- packages/db (schema Drizzle + client pg)
- Supabase (Postgres verdade + Auth + Storage)
- Acesso Direto
- Autoridade Tributária (AT / Portal das Finanças)
- Calendário fiscal mensal (dias 10/17-18/20/25)
- DMR (Declaração Mensal de Remunerações)
- Documento inexistente (estado válido, não erro)
- e-Fatura
- Elevate One (executora)
- Execução multiempresa
- Gabinete de contabilidade (cliente)
- Guia de pagamento (PDF)
- Idempotência (não repetir trabalho já feito)
- IVA (Declaração Periódica do IVA)
- Sigilo profissional e proteção de dados (RGPD)
- Automação de browser (RPA)
- Segurança Social Direta
- TOConline (plataforma cloud da OCC)
- Utilizador dedicado por cliente
- Prazo de validade da guia da Segurança Social
- Conventional Commits
- Feature branches + PR + CI
- clients (empresas do gabinete)
- public.current_app_role() (helper SQL)
- documents (as guias: entidade, referência, valor, valid_until, storage_path)
- events (tabela)
- integration_credentials (acesso por cliente/provider)
- jobs (fila DB-backed)
- logs (tabela)
- obligation_periods (estado por cliente × obrigação × período)
- obligations (obrigação recorrente por cliente)
- profiles (espelha auth.users, role app_role)
- Schema Drizzle = fonte da verdade
- @toc/db (createDb + schema Drizzle tipado)
- traces (tabela)
- DbStore (persistência real)
- Modelo inspirado em distributed tracing
- Event (nó com parent_event_id → árvore causal)
- InMemoryStore (testes sem banco)
- Log (linha fina pendurada num event/trace)
- @toc/core (biblioteca de observabilidade)
- Trace (contexto-raiz por gatilho inicial)
- Tracer / createTracer (@toc/core)
- ObservabilityStore (interface saveTrace/saveEvent/saveLog)
- Plano de implementação — Base do Projeto
- Criptografia de credenciais (planejada, não implementada)
- Roles app_role (viewer/operator/admin)
- Design — Base do Projeto (spec aprovado)
- Fora de escopo nesta base (YAGNI)
- PR Checklist (TDD, lint/typecheck/test, migrations, no secrets)
- pnpm workspace config (apps/*, packages/*)
- Monorepo structure (apps/web, apps/worker, packages/db, packages/core, packages/config)
- Automação de Guias Fiscais (TOConline) project overview

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 16 edges
2. `compilerOptions` - 14 edges
3. `ObservabilityStore` - 14 edges
4. `compilerOptions` - 14 edges
5. `scripts` - 13 edges
6. `Base do Projeto (Automação TOConline) — Implementation Plan` - 13 edges
7. `Contexto do Projeto — Automação de Guias Fiscais (TOConline)` - 12 edges
8. `Design — Base do Projeto: Automação de Guias Fiscais (TOConline)` - 12 edges
9. `Logger` - 10 edges
10. `InMemoryStore` - 10 edges

## Surprising Connections (you probably didn't know these)
- `CI Build web step (Next.js build with Supabase env)` --references--> `apps/web Next.js dashboard README`  [INFERRED]
  .github/workflows/ci.yml → apps/web/README.md
- `TracesPage()` --calls--> `getSessionUser()`  [EXTRACTED]
  apps/web/src/app/(dashboard)/traces/page.tsx → apps/web/src/lib/auth.ts
- `TracesPage()` --calls--> `getSupabaseServerClient()`  [EXTRACTED]
  apps/web/src/app/(dashboard)/traces/page.tsx → apps/web/src/lib/supabase/server.ts
- `signIn()` --calls--> `getSupabaseServerClient()`  [EXTRACTED]
  apps/web/src/app/login/actions.ts → apps/web/src/lib/supabase/server.ts
- `signOut()` --calls--> `getSupabaseServerClient()`  [EXTRACTED]
  apps/web/src/app/login/actions.ts → apps/web/src/lib/supabase/server.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **CI verification pipeline (lint, typecheck, unit tests, DB tests, build web)** — github_workflows_ci_verify, github_workflows_ci_skip_db_tests, github_workflows_ci_build_web, github_pull_request_template_pr_checklist [INFERRED 0.75]
- **Next.js scaffold default assets** — apps_web_public_file_icon, apps_web_public_globe_icon, apps_web_public_next_logo, apps_web_public_vercel_logo, apps_web_public_window_icon [INFERRED 0.85]

## Communities (111 total, 78 thin omitted)

### Community 0 - "Observability Tracer/Logger"
Cohesion: 0.07
Nodes (21): observability, Logger, DbStore, InMemoryStore, ObservabilityStore, createEvent(), createTracer(), EventHandle (+13 more)

### Community 1 - "Architecture & Domain Overview"
Cohesion: 0.09
Nodes (19): Banco, Convenções, Código, Fluxo de trabalho (Git), Observabilidade, TDD, Acesso a dados, Auth / autorização (+11 more)

### Community 2 - "DB Schema (Drizzle)"
Cohesion: 0.10
Nodes (27): createDb(), schema, profiles, clients, documents, integrationCredentials, obligationPeriods, obligations (+19 more)

### Community 3 - "Observability Stores & DB Client"
Cohesion: 0.07
Nodes (27): CLAUDE.md — Automação de Guias Fiscais (TOConline), Comandos essenciais, Convenções técnicas, Estrutura, graphify, Mapa da documentação, Regras de trabalho, 10. Glossário (+19 more)

### Community 4 - "Web App Dependencies"
Cohesion: 0.08
Nodes (25): dependencies, next, react, react-dom, @supabase/ssr, @supabase/supabase-js, devDependencies, eslint (+17 more)

### Community 5 - "DB Package Manifest"
Cohesion: 0.09
Nodes (22): dependencies, drizzle-orm, pg, devDependencies, drizzle-kit, eslint, @toc/config, @types/node (+14 more)

### Community 7 - "Turborepo & Lint Config"
Cohesion: 0.09
Nodes (21): devDependencies, eslint, @eslint/js, prettier, @toc/config, turbo, typescript, typescript-eslint (+13 more)

### Community 8 - "Root Package Scripts"
Cohesion: 0.10
Nodes (20): engines, node, name, packageManager, private, scripts, build, db:generate (+12 more)

### Community 9 - "Web App tsconfig"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 10 - "Core Package Manifest"
Cohesion: 0.10
Nodes (19): dependencies, drizzle-orm, @toc/db, devDependencies, eslint, @toc/config, @types/node, typescript (+11 more)

### Community 11 - "Worker Package Manifest"
Cohesion: 0.11
Nodes (18): dependencies, @toc/core, @toc/db, devDependencies, eslint, @toc/config, @types/node, typescript (+10 more)

### Community 12 - "Web Auth & Pages"
Cohesion: 0.23
Nodes (11): TraceRow, TracesPage(), signIn(), signOut(), AppRole, getSessionUser(), requireRole(), ROLE_ORDER (+3 more)

### Community 13 - "Shared Base tsconfig"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, lib, module, moduleResolution (+7 more)

### Community 14 - "Shared Base tsconfig (variant)"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, lib, module, moduleResolution (+7 more)

### Community 15 - "Docs, CI & PR Workflow"
Cohesion: 0.50
Nodes (4): apps/web Next.js dashboard README, CI Build web step (Next.js build with Supabase env), SKIP_DB_TESTS flag (skip @toc/db integration tests in CI), CI verify job

### Community 16 - "Config Package Manifest"
Cohesion: 0.18
Nodes (10): dependencies, @eslint/js, typescript-eslint, exports, ./eslint, ./tsconfig, name, private (+2 more)

### Community 17 - "Web Middleware & Proxy"
Cohesion: 0.47
Nodes (4): CookieToSet, updateSession(), config, proxy()

### Community 18 - "Package tsconfig (core)"
Cohesion: 0.33
Nodes (5): compilerOptions, outDir, rootDir, extends, include

### Community 19 - "Package tsconfig (db)"
Cohesion: 0.33
Nodes (5): compilerOptions, outDir, rootDir, extends, include

### Community 20 - "Package tsconfig (worker)"
Cohesion: 0.33
Nodes (5): compilerOptions, outDir, rootDir, extends, include

### Community 42 - "Design — Base do Projeto: Automação de Guias Fiscais (TOConline)"
Cohesion: 0.12
Nodes (16): 10. Fora de escopo nesta base (YAGNI), 11. Riscos e pontos em aberto (herdados do contexto), 1. Objetivo desta base, 2. Arquitetura geral, 3. Stack, 4. Estrutura de pastas, 5.1 Auth / autorização, 5.2 Observabilidade / eventos correlacionados (+8 more)

### Community 43 - "Base do Projeto (Automação TOConline) — Implementation Plan"
Cohesion: 0.14
Nodes (13): Base do Projeto (Automação TOConline) — Implementation Plan, File Structure, Global Constraints, Task 0: Branch de trabalho, Task 1: Esqueleto do monorepo + tooling, Task 2: Supabase local + `packages/db` (Drizzle base), Task 3: Schema backbone — auth + observabilidade + jobs (com RLS), Task 4: Schema esqueleto de domínio (com RLS) (+5 more)

### Community 44 - "Arquitetura"
Cohesion: 0.29
Nodes (6): Arquitetura, Deploy, Fila de trabalho, Fronteiras dos pacotes, Por que dois deployables, Visão geral

### Community 45 - "pull_request_template.md"
Cohesion: 0.40
Nodes (4): Checklist, Como testar, O que muda, Por quê

### Community 46 - "README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

## Knowledge Gaps
- **324 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+319 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **78 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `devDependencies` connect `Turborepo & Lint Config` to `Root Package Scripts`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `NOTE: This file should not be edited`, `nextConfig` to the rest of the system?**
  _339 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Observability Tracer/Logger` be split into smaller, more focused modules?**
  _Cohesion score 0.06547619047619048 - nodes in this community are weakly interconnected._
- **Should `Architecture & Domain Overview` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._
- **Should `DB Schema (Drizzle)` be split into smaller, more focused modules?**
  _Cohesion score 0.09759759759759759 - nodes in this community are weakly interconnected._
- **Should `Observability Stores & DB Client` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._
- **Should `Web App Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.07692307692307693 - nodes in this community are weakly interconnected._