# Graph Report - automacao-toc-online  (2026-08-11)

## Corpus Check
- 178 files · ~70,637 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1018 nodes · 1693 edges · 126 communities (57 shown, 69 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ef2eda44`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Observability Tracer/Logger
- Architecture & Domain Overview
- DB Schema (Drizzle)
- Observability Stores & DB Client
- Web App Dependencies
- Módulo 1 — Extração de guias de pagamento da AT (IVA)
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
- compilerOptions
- Package tsconfig (core)
- Package tsconfig (db)
- Package tsconfig (worker)
- Web Root Layout
- Web ESLint Config
- Next.js Config
- Next Env Types
- Web Home Page
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
- README.md
- @toc/worker (scaffold)
- layout.tsx
- cn
- Design System Cliconta + Reformulação do Front-end — Design
- components.json
- Cliconta Design System + Reformulação do Front-end — Implementation Plan
- postcss.config.mjs
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
- page.tsx
- Sequenciamento e o portão da Fase 0
- store.ts
- types.ts
- user-menu.tsx
- InMemoryStore
- getSupabaseAdminClient
- env.ts
- Task 1 report — Fundação do worker (Vitest, Playwright, config de ambiente)
- tsconfig.json
- Logger
- progress.md
- task-1-brief.md

## God Nodes (most connected - your core abstractions)
1. `cn()` - 60 edges
2. `getSessionUser()` - 25 edges
3. `getSupabaseServerClient()` - 22 edges
4. `compilerOptions` - 16 edges
5. `Cliconta Design System + Reformulação do Front-end — Implementation Plan` - 16 edges
6. `requireRole()` - 15 edges
7. `getSupabaseAdminClient()` - 15 edges
8. `ObservabilityStore` - 15 edges
9. `Módulo 1 — Extração de guias de pagamento da AT (IVA)` - 15 edges
10. `compilerOptions` - 14 edges

## Surprising Connections (you probably didn't know these)
- `ProfileRow` --references--> `AppRole`  [EXTRACTED]
  apps/web/src/app/(dashboard)/admin/users/page.tsx → packages/core/src/auth/roles.ts
- `AdminUsersPage()` --calls--> `dbRoleToUiLabel()`  [EXTRACTED]
  apps/web/src/app/(dashboard)/admin/users/page.tsx → packages/core/src/auth/roles.ts
- `SessionUser` --references--> `AppRole`  [EXTRACTED]
  apps/web/src/lib/auth.ts → packages/core/src/auth/roles.ts
- `requireRole()` --references--> `ROLE_ORDER`  [EXTRACTED]
  apps/web/src/lib/auth.ts → packages/core/src/auth/roles.ts
- `requireWriter()` --references--> `ROLE_ORDER`  [EXTRACTED]
  apps/web/src/lib/companies/service.ts → packages/core/src/auth/roles.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **CI verification pipeline (lint, typecheck, unit tests, DB tests, build web)** — github_workflows_ci_verify, github_workflows_ci_skip_db_tests, github_workflows_ci_build_web, github_pull_request_template_pr_checklist [INFERRED 0.75]
- **Next.js scaffold default assets** — apps_web_public_file_icon, apps_web_public_globe_icon, apps_web_public_next_logo, apps_web_public_vercel_logo, apps_web_public_window_icon [INFERRED 0.85]

## Communities (126 total, 69 thin omitted)

### Community 0 - "Observability Tracer/Logger"
Cohesion: 0.12
Nodes (9): SupabaseStore, EventRecord, LogRecord, fakeClient(), loggedAt, makeStore(), occurredAt, RecordedCall (+1 more)

### Community 1 - "Architecture & Domain Overview"
Cohesion: 0.08
Nodes (22): Acesso a dados, Auth / autorização, Banco de dados, Bootstrap do admin, Domínio (esqueleto, enums extensíveis), Fluxo de migrations, Multi-tenant (equipe = gabinete), Observabilidade (+14 more)

### Community 2 - "DB Schema (Drizzle)"
Cohesion: 0.07
Nodes (34): profiles, companies, documents, integrationCredentials, obligationPeriods, obligations, appRole, companyStatus (+26 more)

### Community 3 - "Observability Stores & DB Client"
Cohesion: 0.06
Nodes (51): Ctx, DELETE(), PATCH(), POST(), CompanyFormState, createCompanyAction(), deleteCompanyAction(), updateCompanyAction() (+43 more)

### Community 4 - "Web App Dependencies"
Cohesion: 0.05
Nodes (37): dependencies, class-variance-authority, clsx, lucide-react, next, @radix-ui/react-dialog, @radix-ui/react-dropdown-menu, react (+29 more)

### Community 5 - "Módulo 1 — Extração de guias de pagamento da AT (IVA)"
Cohesion: 0.09
Nodes (22): 10. Fase 0 — reconhecimento, 11. Alternativas rejeitadas, 12. Critérios de aceitação, 13. Riscos, 14. Pontos em aberto, 1. Objetivo, 2. Decisões tomadas, 3. Fronteiras (+14 more)

### Community 7 - "Turborepo & Lint Config"
Cohesion: 0.09
Nodes (20): 10. Glossário, 11. Pontos ainda em aberto (a confirmar com o cliente), 1. Resumo executivo, 2. Atores e stakeholders, 3. A plataforma TOConline, 4.1. O que já é automático (em lote, dentro do TOConline), 4.2. O gargalo (manual, cliente a cliente), 4. O processo atual (como o gabinete trabalha hoje) (+12 more)

### Community 8 - "Root Package Scripts"
Cohesion: 0.07
Nodes (28): devDependencies, eslint, @eslint/js, prettier, @toc/config, turbo, typescript, typescript-eslint (+20 more)

### Community 9 - "Web App tsconfig"
Cohesion: 0.09
Nodes (22): dependencies, drizzle-orm, pg, devDependencies, drizzle-kit, eslint, @toc/config, @types/node (+14 more)

### Community 10 - "Core Package Manifest"
Cohesion: 0.08
Nodes (23): dependencies, drizzle-orm, @toc/db, devDependencies, eslint, @supabase/supabase-js, @toc/config, @types/node (+15 more)

### Community 11 - "Worker Package Manifest"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 12 - "Web Auth & Pages"
Cohesion: 0.10
Nodes (34): GET(), GET(), Ctx, DELETE(), GET(), PATCH(), GET(), POST() (+26 more)

### Community 13 - "Shared Base tsconfig"
Cohesion: 0.09
Nodes (21): dependencies, playwright, @supabase/supabase-js, @toc/core, @toc/db, devDependencies, eslint, @toc/config (+13 more)

### Community 14 - "Shared Base tsconfig (variant)"
Cohesion: 0.12
Nodes (16): 10. Fora de escopo nesta base (YAGNI), 11. Riscos e pontos em aberto (herdados do contexto), 1. Objetivo desta base, 2. Arquitetura geral, 3. Stack, 4. Estrutura de pastas, 5.1 Auth / autorização, 5.2 Observabilidade / eventos correlacionados (+8 more)

### Community 15 - "Docs, CI & PR Workflow"
Cohesion: 0.50
Nodes (4): apps/web Next.js dashboard README, CI Build web step (Next.js build with Supabase env), SKIP_DB_TESTS flag (skip @toc/db integration tests in CI), CI verify job

### Community 16 - "Config Package Manifest"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, lib, module, moduleResolution (+7 more)

### Community 17 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, lib, module, moduleResolution (+7 more)

### Community 18 - "Package tsconfig (core)"
Cohesion: 0.14
Nodes (13): Base do Projeto (Automação TOConline) — Implementation Plan, File Structure, Global Constraints, Task 0: Branch de trabalho, Task 1: Esqueleto do monorepo + tooling, Task 2: Supabase local + `packages/db` (Drizzle base), Task 3: Schema backbone — auth + observabilidade + jobs (com RLS), Task 4: Schema esqueleto de domínio (com RLS) (+5 more)

### Community 19 - "Package tsconfig (db)"
Cohesion: 0.14
Nodes (13): dependsOn, outputs, cache, persistent, $schema, tasks, build, dev (+5 more)

### Community 20 - "Package tsconfig (worker)"
Cohesion: 0.29
Nodes (6): Banco, Convenções, Código, Fluxo de trabalho (Git), Observabilidade, TDD

### Community 21 - "Web Root Layout"
Cohesion: 0.40
Nodes (3): display, metadata, sans

### Community 25 - "Web Home Page"
Cohesion: 0.25
Nodes (7): CLAUDE.md — Automação de Guias Fiscais (TOConline), Comandos essenciais, Convenções técnicas, Estrutura, graphify, Mapa da documentação, Regras de trabalho

### Community 42 - "CLAUDE.md — Automação de Guias Fiscais (TOConline)"
Cohesion: 0.18
Nodes (10): dependencies, @eslint/js, typescript-eslint, exports, ./eslint, ./tsconfig, name, private (+2 more)

### Community 43 - "Base do Projeto (Automação TOConline) — Implementation Plan"
Cohesion: 0.16
Nodes (5): ObservabilityStore, createEvent(), EventHandle, TraceHandle, EventInput

### Community 44 - "Arquitetura"
Cohesion: 0.25
Nodes (7): Arquitetura, Deploy, Fila de trabalho, Fronteiras dos pacotes, Por que dois deployables, Superfície de API (apps/web), Visão geral

### Community 45 - "pull_request_template.md"
Cohesion: 0.33
Nodes (5): compilerOptions, outDir, rootDir, extends, include

### Community 46 - "README.md"
Cohesion: 0.33
Nodes (5): compilerOptions, outDir, rootDir, extends, include

### Community 47 - "@toc/worker (scaffold)"
Cohesion: 0.40
Nodes (4): Checklist, Como testar, O que muda, Por quê

### Community 80 - "clients (empresas do gabinete)"
Cohesion: 0.09
Nodes (27): changePassword(), createUser(), CreateUserState, VALID_UI_ROLES, ProfileRow, CookieToSet, updateSession(), config (+19 more)

### Community 81 - "README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

### Community 87 - "layout.tsx"
Cohesion: 0.40
Nodes (5): EventRow, LogRow, renderEventTree(), TraceDetailPage(), TraceRow

### Community 88 - "cn"
Cohesion: 0.05
Nodes (83): CreateUserForm(), initialState, AdminUsersPage(), CompanyForm(), EditCompanyPage(), EmpresasPage(), EditTeamPage(), EquipesPage() (+75 more)

### Community 89 - "Design System Cliconta + Reformulação do Front-end — Design"
Cohesion: 0.09
Nodes (21): 10. Acessibilidade, 11. Fora de escopo (YAGNI), 12. Riscos e mitigação, 1. Objetivo, 2. Contexto e restrições, 3. Referência visual (DNA da Cliconta), 4.1 Cores, 4.2 Tipografia (Hanken Grotesk; display peso 500) (+13 more)

### Community 90 - "components.json"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 91 - "Cliconta Design System + Reformulação do Front-end — Implementation Plan"
Cohesion: 0.12
Nodes (16): Cliconta Design System + Reformulação do Front-end — Implementation Plan, File Structure, Global Constraints, Self-Review (cobertura da spec), Task 10: Equipes (lista + form em Dialog + edição), Task 11: Admin / Usuários, Task 12: Verificação final, Task 1: Fundação — Tailwind v4, tokens, fontes, `cn` (+8 more)

### Community 113 - "Sequenciamento e o portão da Fase 0"
Cohesion: 0.11
Nodes (17): Global Constraints, Módulo 1 — Extração de guias do IVA na AT — Implementation Plan, Sequenciamento e o portão da Fase 0, Task 10: `AcessoDiretoProvider` — abrir o Portal das Finanças por empresa, Task 11: `IvaExtractor` — o caminho do IVA, testado contra fixtures, Task 12: Captura de diagnóstico em falha, Task 13: Ligação final — loop do worker e verificação ponta a ponta, Task 1: Fundação do worker (Vitest, Playwright, config de ambiente) (+9 more)

### Community 114 - "store.ts"
Cohesion: 0.22
Nodes (4): DbStore, TraceRecord, Database, schema

### Community 115 - "types.ts"
Cohesion: 0.25
Nodes (9): Tracer, ErrorInput, EventStatus, LogLevel, StartTraceInput, TraceStatus, TriggerKind, recordUserEvent() (+1 more)

### Community 116 - "user-menu.tsx"
Cohesion: 0.29
Nodes (8): AppShellProps, ROLE_LABELS, UserMenu(), initialsFrom(), DropdownMenuContent(), DropdownMenuItem(), DropdownMenuLabel(), DropdownMenuSeparator()

### Community 117 - "InMemoryStore"
Cohesion: 0.25
Nodes (3): observability, InMemoryStore, createTracer()

### Community 118 - "getSupabaseAdminClient"
Cohesion: 0.46
Nodes (5): signIn(), signOut(), getWebTracer(), logUserEvent(), getSupabaseAdminClient()

### Community 119 - "env.ts"
Cohesion: 0.32
Nodes (5): loadEnv(), MissingEnvError, REQUIRED, WorkerEnv, complete

### Community 120 - "Task 1 report — Fundação do worker (Vitest, Playwright, config de ambiente)"
Cohesion: 0.25
Nodes (7): Ficheiros alterados, Issues ou concerns, O que foi implementado, O que foi testado e resultados, Self-review, Task 1 report — Fundação do worker (Vitest, Playwright, config de ambiente), TDD Evidence

### Community 121 - "tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, outDir, rootDir, extends, include

## Knowledge Gaps
- **476 isolated node(s):** `$schema`, `style`, `rsc`, `tsx`, `config` (+471 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **69 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `cn` to `user-menu.tsx`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Why does `AppShell()` connect `Web App Dependencies` to `user-menu.tsx`, `Web Auth & Pages`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **What connects `$schema`, `style`, `rsc` to the rest of the system?**
  _488 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Observability Tracer/Logger` be split into smaller, more focused modules?**
  _Cohesion score 0.12105263157894737 - nodes in this community are weakly interconnected._
- **Should `Architecture & Domain Overview` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._
- **Should `DB Schema (Drizzle)` be split into smaller, more focused modules?**
  _Cohesion score 0.07183673469387755 - nodes in this community are weakly interconnected._
- **Should `Observability Stores & DB Client` be split into smaller, more focused modules?**
  _Cohesion score 0.05642080517190714 - nodes in this community are weakly interconnected._