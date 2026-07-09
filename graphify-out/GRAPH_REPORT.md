# Graph Report - automacao-toc-online  (2026-07-08)

## Corpus Check
- 95 files · ~28,618 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 581 nodes · 687 edges · 99 communities (34 shown, 65 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `efcce8f0`
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
- CLAUDE.md — Automação de Guias Fiscais (TOConline)
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
7. `getSupabaseServerClient()` - 12 edges
8. `Contexto do Projeto — Automação de Guias Fiscais (TOConline)` - 12 edges
9. `Design — Base do Projeto: Automação de Guias Fiscais (TOConline)` - 12 edges
10. `Logger` - 10 edges

## Surprising Connections (you probably didn't know these)
- `createUser()` --calls--> `registerUser()`  [EXTRACTED]
  apps/web/src/app/(dashboard)/admin/users/actions.ts → packages/core/src/auth/register.ts
- `ProfileRow` --references--> `AppRole`  [EXTRACTED]
  apps/web/src/app/(dashboard)/admin/users/page.tsx → packages/core/src/auth/roles.ts
- `AdminUsersPage()` --calls--> `dbRoleToUiLabel()`  [EXTRACTED]
  apps/web/src/app/(dashboard)/admin/users/page.tsx → packages/core/src/auth/roles.ts
- `changePassword()` --calls--> `validateNewPassword()`  [EXTRACTED]
  apps/web/src/app/change-password/actions.ts → packages/core/src/auth/validate.ts
- `SessionUser` --references--> `AppRole`  [EXTRACTED]
  apps/web/src/lib/auth.ts → packages/core/src/auth/roles.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **CI verification pipeline (lint, typecheck, unit tests, DB tests, build web)** — github_workflows_ci_verify, github_workflows_ci_skip_db_tests, github_workflows_ci_build_web, github_pull_request_template_pr_checklist [INFERRED 0.75]
- **Next.js scaffold default assets** — apps_web_public_file_icon, apps_web_public_globe_icon, apps_web_public_next_logo, apps_web_public_vercel_logo, apps_web_public_window_icon [INFERRED 0.85]

## Communities (99 total, 65 thin omitted)

### Community 0 - "Observability Tracer/Logger"
Cohesion: 0.06
Nodes (22): observability, Logger, DbStore, InMemoryStore, ObservabilityStore, createEvent(), createTracer(), EventHandle (+14 more)

### Community 1 - "Architecture & Domain Overview"
Cohesion: 0.09
Nodes (20): Banco, Convenções, Código, Fluxo de trabalho (Git), Observabilidade, TDD, Acesso a dados, Auth / autorização (+12 more)

### Community 2 - "DB Schema (Drizzle)"
Cohesion: 0.09
Nodes (28): createDb(), profiles, clients, documents, integrationCredentials, obligationPeriods, obligations, appRole (+20 more)

### Community 3 - "Observability Stores & DB Client"
Cohesion: 0.12
Nodes (16): 10. Fora de escopo nesta base (YAGNI), 11. Riscos e pontos em aberto (herdados do contexto), 1. Objetivo desta base, 2. Arquitetura geral, 3. Stack, 4. Estrutura de pastas, 5.1 Auth / autorização, 5.2 Observabilidade / eventos correlacionados (+8 more)

### Community 4 - "Web App Dependencies"
Cohesion: 0.07
Nodes (27): dependencies, next, react, react-dom, server-only, @supabase/ssr, @supabase/supabase-js, @toc/core (+19 more)

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
Cohesion: 0.09
Nodes (21): dependencies, drizzle-orm, @toc/db, devDependencies, eslint, @toc/config, @types/node, typescript (+13 more)

### Community 11 - "Worker Package Manifest"
Cohesion: 0.11
Nodes (18): dependencies, @toc/core, @toc/db, devDependencies, eslint, @toc/config, @types/node, typescript (+10 more)

### Community 12 - "Web Auth & Pages"
Cohesion: 0.18
Nodes (16): changePassword(), ChangePasswordPage(), createUser(), CreateUserState, CreateUserForm(), initialState, AdminUsersPage(), TraceRow (+8 more)

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

### Community 18 - "Package tsconfig (core)"
Cohesion: 0.33
Nodes (5): compilerOptions, outDir, rootDir, extends, include

### Community 19 - "Package tsconfig (db)"
Cohesion: 0.33
Nodes (5): compilerOptions, outDir, rootDir, extends, include

### Community 20 - "Package tsconfig (worker)"
Cohesion: 0.33
Nodes (5): compilerOptions, outDir, rootDir, extends, include

### Community 42 - "CLAUDE.md — Automação de Guias Fiscais (TOConline)"
Cohesion: 0.07
Nodes (27): CLAUDE.md — Automação de Guias Fiscais (TOConline), Comandos essenciais, Convenções técnicas, Estrutura, graphify, Mapa da documentação, Regras de trabalho, 10. Glossário (+19 more)

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

### Community 80 - "clients (empresas do gabinete)"
Cohesion: 0.09
Nodes (24): ProfileRow, SessionUser, CookieToSet, updateSession(), config, proxy(), ChangePasswordGuardInput, shouldRedirectToChangePassword() (+16 more)

## Knowledge Gaps
- **321 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+316 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **65 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `devDependencies` connect `Turborepo & Lint Config` to `Root Package Scripts`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `NOTE: This file should not be edited`, `nextConfig` to the rest of the system?**
  _333 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Observability Tracer/Logger` be split into smaller, more focused modules?**
  _Cohesion score 0.06394230769230769 - nodes in this community are weakly interconnected._
- **Should `Architecture & Domain Overview` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
- **Should `DB Schema (Drizzle)` be split into smaller, more focused modules?**
  _Cohesion score 0.08780487804878048 - nodes in this community are weakly interconnected._
- **Should `Observability Stores & DB Client` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._
- **Should `Web App Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.07142857142857142 - nodes in this community are weakly interconnected._