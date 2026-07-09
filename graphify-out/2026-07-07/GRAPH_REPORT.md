# Graph Report - .  (2026-07-07)

## Corpus Check
- Corpus is ~21,979 words - fits in a single context window. You may not need a graph.

## Summary
- 437 nodes · 535 edges · 42 communities (29 shown, 13 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.88)
- Token cost: 163,100 input · 0 output

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

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 16 edges
2. `compilerOptions` - 14 edges
3. `ObservabilityStore` - 14 edges
4. `compilerOptions` - 14 edges
5. `scripts` - 13 edges
6. `Logger` - 10 edges
7. `InMemoryStore` - 10 edges
8. `DbStore` - 9 edges
9. `Database` - 9 edges
10. `scripts` - 8 edges

## Surprising Connections (you probably didn't know these)
- `CI Build web step (Next.js build with Supabase env)` --references--> `apps/web Next.js dashboard README`  [INFERRED]
  .github/workflows/ci.yml → apps/web/README.md
- `Monorepo structure (apps/web, apps/worker, packages/db, packages/core, packages/config)` --references--> `apps/web Next.js dashboard README`  [INFERRED]
  README.md → apps/web/README.md
- `Monorepo structure (apps/web, apps/worker, packages/db, packages/core, packages/config)` --references--> `@toc/worker RPA worker (scaffold)`  [INFERRED]
  README.md → apps/worker/README.md
- `Monorepo structure (apps/web, apps/worker, packages/db, packages/core, packages/config)` --shares_data_with--> `pnpm workspace config (apps/*, packages/*)`  [INFERRED]
  README.md → pnpm-workspace.yaml
- `@toc/worker RPA worker (scaffold)` --semantically_similar_to--> `apps/web Next.js dashboard README`  [INFERRED] [semantically similar]
  apps/worker/README.md → apps/web/README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **CI verification pipeline (lint, typecheck, unit tests, DB tests, build web)** — github_workflows_ci_verify, github_workflows_ci_skip_db_tests, github_workflows_ci_build_web, github_pull_request_template_pr_checklist [INFERRED 0.75]
- **Monorepo workspace composition (web, worker, shared packages)** — readme_monorepo_structure, pnpm_workspace_workspace_config, apps_web_readme_nextjs_app, apps_worker_readme_rpa_worker [INFERRED 0.75]
- **Fluxo de observabilidade trace → event → log** — docs_event_logging_trace, docs_event_logging_event, docs_event_logging_log, docs_event_logging_tracer [EXTRACTED 0.95]
- **Cadeia de domínio clients → obligations → obligation_periods → documents** — docs_database_clients, docs_database_obligations, docs_database_obligation_periods, docs_database_documents [EXTRACTED 0.95]
- **Acesso Direto do TOConline aos portais do Estado** — docs_context_project_context_toconline, docs_context_project_context_acesso_direto, docs_context_project_context_autoridade_tributaria, docs_context_project_context_seguranca_social, docs_context_project_context_efatura [EXTRACTED 0.90]
- **Next.js scaffold default assets** — apps_web_public_file_icon, apps_web_public_globe_icon, apps_web_public_next_logo, apps_web_public_vercel_logo, apps_web_public_window_icon [INFERRED 0.85]

## Communities (42 total, 13 thin omitted)

### Community 0 - "Observability Tracer/Logger"
Cohesion: 0.09
Nodes (15): observability, Logger, ObservabilityStore, createEvent(), createTracer(), EventHandle, TraceHandle, Tracer (+7 more)

### Community 1 - "Architecture & Domain Overview"
Cohesion: 0.08
Nodes (36): apps/web (Next.js App Router → Vercel), apps/worker (Node + Playwright RPA), Fila de trabalho (tabela jobs, FOR UPDATE SKIP LOCKED), Monorepo com dois deployables, Fronteiras dos pacotes, packages/core (Tracer/Logger + tipos de domínio), packages/db (schema Drizzle + client pg), Supabase (Postgres verdade + Auth + Storage) (+28 more)

### Community 2 - "DB Schema (Drizzle)"
Cohesion: 0.10
Nodes (25): profiles, clients, documents, integrationCredentials, obligationPeriods, obligations, appRole, clientStatus (+17 more)

### Community 3 - "Observability Stores & DB Client"
Cohesion: 0.13
Nodes (8): DbStore, InMemoryStore, EventRecord, LogRecord, TraceRecord, createDb(), Database, schema

### Community 4 - "Web App Dependencies"
Cohesion: 0.08
Nodes (25): dependencies, next, react, react-dom, @supabase/ssr, @supabase/supabase-js, devDependencies, eslint (+17 more)

### Community 5 - "DB Package Manifest"
Cohesion: 0.09
Nodes (22): dependencies, drizzle-orm, pg, devDependencies, drizzle-kit, eslint, @toc/config, @types/node (+14 more)

### Community 6 - "Fiscal Domain & RLS"
Cohesion: 0.11
Nodes (22): 2FA obrigatório na Segurança Social, Acesso Direto, Autoridade Tributária (AT / Portal das Finanças), DMR (Declaração Mensal de Remunerações), e-Fatura, Guia de pagamento (PDF), Idempotência (não repetir trabalho já feito), IVA (Declaração Periódica do IVA) (+14 more)

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
Cohesion: 0.15
Nodes (14): apps/web Next.js dashboard README, jobs queue consumed by worker, Worker runs off Vercel (long-running process + real browser), Portal automation (TOConline, AT, Segurança Social, e-Fatura), @toc/worker RPA worker (scaffold), @toc/core observability (Tracer/Logger), PR Checklist (TDD, lint/typecheck/test, migrations, no secrets), CI Build web step (Next.js build with Supabase env) (+6 more)

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

## Knowledge Gaps
- **210 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+205 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `TOConline (plataforma cloud da OCC)` connect `Architecture & Domain Overview` to `Fiscal Domain & RLS`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `ObservabilityStore` connect `Observability Tracer/Logger` to `Observability Stores & DB Client`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `NOTE: This file should not be edited`, `nextConfig` to the rest of the system?**
  _216 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Observability Tracer/Logger` be split into smaller, more focused modules?**
  _Cohesion score 0.08943089430894309 - nodes in this community are weakly interconnected._
- **Should `Architecture & Domain Overview` be split into smaller, more focused modules?**
  _Cohesion score 0.0761904761904762 - nodes in this community are weakly interconnected._
- **Should `DB Schema (Drizzle)` be split into smaller, more focused modules?**
  _Cohesion score 0.0967741935483871 - nodes in this community are weakly interconnected._
- **Should `Observability Stores & DB Client` be split into smaller, more focused modules?**
  _Cohesion score 0.1339031339031339 - nodes in this community are weakly interconnected._