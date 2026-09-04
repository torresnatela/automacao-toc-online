# Graph Report - automacao-toc-online-main  (2026-09-04)

## Corpus Check
- 338 files · ~245,768 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2498 nodes · 4960 edges · 178 communities (152 shown, 26 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 15 edges (avg confidence: 0.7)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ae5198d1`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Observability Tracer/Logger
- Architecture & Domain Overview
- DB Schema (Drizzle)
- Observability Stores & DB Client
- Web App Dependencies
- Database
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
- Worker Entrypoint
- File Icon Asset
- Globe Icon Asset
- Next.js Logo Asset
- Vercel Logo Asset
- Window Icon Asset
- Config Package
- .run
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
- TocCredentialForm.tsx
- tenancy.smoke.test.ts
- apps/worker (Node + Playwright RPA)
- ObligationLedger
- domain.smoke.test.ts
- JobQueue
- actions.ts
- browser.ts
- normalize.ts
- DbObligationLedger
- sinks.test.ts
- session.browser.test.ts
- iva-outcome-effects.ts
- RowDetailsDialog.tsx
- document-store.ts
- iva-fakes.ts
- FakeLedger
- FakeRepo
- getSessionUser
- credential-form.tsx
- ObligationLedger
- StartedAction
- FakeDeclarations
- FakeGate
- AtCredentialSource
- FakeSessions
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
- types.ts
- browser.ts
- normalize.ts
- InMemoryStore (testes sem banco)
- Log (linha fina pendurada num event/trace)
- AtFixtureServer
- selectors.test.ts
- sidebar.tsx
- ObservabilityStore (interface saveTrace/saveEvent/saveLog)
- Plano de implementação — Base do Projeto
- Criptografia de credenciais (planejada, não implementada)
- Roles app_role (viewer/operator/admin)
- Design — Base do Projeto (spec aprovado)
- Fora de escopo nesta base (YAGNI)
- PR Checklist (TDD, lint/typecheck/test, migrations, no secrets)
- pnpm workspace config (apps/*, packages/*)
- Task 5 — `IvaDocumentRunner` (orquestração) + testes com fakes
- AcessoGovAtSessions
- Task 11 — Serviço de documentos (listar, enfileirar por empresa, enfileirar em lote) + página mínima + e2e de enfileiramento
- service.ts
- package.json
- session.ts
- iva-sinks.test.ts
- Onda final de correções — Módulo 1 (uma só passagem)
- storage-state.ts
- cn
- Task 13 — `CredentialForm` genérico, página `/integracoes/at`, nav + e2e
- session.browser.test.ts
- Task 2 Report: Buckets de Storage (`guias` e `rpa-diagnostics`)
- types.ts
- enums.ts
- session-acesso-gov.browser.test.ts
- supabase-store.test.ts
- supabase-store.test.ts
- tsconfig.test.json
- page.tsx
- index.ts
- index.ts
- task-1-brief.md
- auth-profiles.smoke.test.ts
- browser.ts
- ObligationLedger
- tsconfig.json
- SDD ledger — plan: /Users/gabrieltorresbolognani/.claude/plans/construa-um-plano-completo-vast-clock.md
- AtCredentialSource
- PortalGate
- ports.ts
- ObservabilityStore
- companies-grid.browser.test.ts
- AtSessionFactory
- validate.ts
- FakeCredentials
- types.ts
- CompanyScanner
- Logger
- cn
- user-menu.tsx
- page.tsx
- enums.ts
- company-directory.ts
- integracoes-at.spec.ts
- GridProjection
- service.ts
- DbAttemptGuard
- due-date.ts
- actions.ts
- AtPaymentDocumentFetcher
- credential.ts
- obligation-ledger.ts
- Emissor
- sinks.test.ts
- readiness.ts
- document-store.ts
- page.tsx
- actions.ts
- CLAUDE.md — Automação de Guias Fiscais (TOConline)
- Tabelas (base)
- Logger
- Automação de Guias Fiscais (TOConline)

## God Nodes (most connected - your core abstractions)
1. `cn()` - 60 edges
2. `Database` - 39 edges
3. `getSessionUser()` - 30 edges
4. `getSupabaseServerClient()` - 30 edges
5. `getSupabaseAdminClient()` - 24 edges
6. `StructuralError` - 24 edges
7. `requireRole()` - 21 edges
8. `enqueueIvaFetch()` - 20 edges
9. `listTeams()` - 20 edges
10. `AcessoGovAtSessions` - 20 edges

## Surprising Connections (you probably didn't know these)
- `LastFetch` --references--> `IvaOutcome`  [EXTRACTED]
  apps/web/src/lib/documents/bulk.ts → packages/core/src/domain/at/outcomes.ts
- `WorkerEnv` --references--> `AtAccessMode`  [EXTRACTED]
  apps/worker/src/config/env.ts → packages/core/src/domain/at/types.ts
- `ContextoDoJob` --references--> `AtAccessMode`  [EXTRACTED]
  apps/worker/src/runner/iva-document-runner.ts → packages/core/src/domain/at/types.ts
- `makeCredential()` --calls--> `encryptSecret()`  [EXTRACTED]
  apps/worker/test/sinks/iva-sinks.test.ts → packages/core/src/crypto/secret-box.ts
- `planCompanyReconciliation()` --indirect_call--> `company()`  [INFERRED]
  packages/core/src/domain/toconline/reconcile.ts → apps/worker/test/toconline/guards.test.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Next.js scaffold default assets** — apps_web_public_file_icon, apps_web_public_globe_icon, apps_web_public_next_logo, apps_web_public_vercel_logo, apps_web_public_window_icon [INFERRED 0.85]

## Communities (178 total, 26 thin omitted)

### Community 0 - "Observability Tracer/Logger"
Cohesion: 0.14
Nodes (17): CompanyField, validateCompanyInput(), TeamField, COMPANY_STATUSES, CompanyInput, CONTRIBUTOR_TYPES, ContributorType, DOCUMENT_STATUSES (+9 more)

### Community 1 - "Architecture & Domain Overview"
Cohesion: 0.18
Nodes (11): Checklist "sempre logar", Correlação (o "correlationID"), Evento de usuário no app web (login/logout), Fluxo de sistema / integração, Modelo (tabelas em `packages/db/src/schema/observability.ts`), Observabilidade: o módulo de logs, Os dois tipos de evento, Receitas (+3 more)

### Community 2 - "DB Schema (Drizzle)"
Cohesion: 0.07
Nodes (29): 1. `supabase/config.toml` — bucket declarado num sítio só, 2. `packages/db/tsconfig.json` — `rootDir` de `"../.."` para `".."`, 3. `packages/db/test/iva-documents.smoke.test.ts`, Auto-revisão, Commits, Concerns, Desvio necessário: `packages/db/tsconfig.json`, Estado dos concerns originais (+21 more)

### Community 3 - "Observability Stores & DB Client"
Cohesion: 0.10
Nodes (29): AtFixtureMode, AtFixtureServer, AtFixtureState, DECLARACOES, fechar(), FORMULARIO_LOGIN(), gerarPdfSintetico(), html() (+21 more)

### Community 4 - "Web App Dependencies"
Cohesion: 0.05
Nodes (39): dependencies, class-variance-authority, clsx, lucide-react, next, @radix-ui/react-dialog, @radix-ui/react-dropdown-menu, react (+31 more)

### Community 5 - "Database"
Cohesion: 0.10
Nodes (20): ScanOutcome, ScanPayload, ScanRunnerDeps, AtSessionUrls, AuthenticatedTocSession, CompanyDirectory, CompanyScanner, CredentialSource (+12 more)

### Community 6 - "Fiscal Domain & RLS"
Cohesion: 0.13
Nodes (6): FileStorageStateStore, InMemoryStorageStateStore, safeName(), SavedSession, StorageStateStore, dirs

### Community 7 - "Turborepo & Lint Config"
Cohesion: 0.11
Nodes (20): BrowserProvider, PlaywrightBrowser, StorageState, NIFS, padroesDeHost(), SENHAS, abrirSessao(), apontada() (+12 more)

### Community 8 - "Root Package Scripts"
Cohesion: 0.07
Nodes (28): devDependencies, eslint, @eslint/js, prettier, @toc/config, turbo, typescript, typescript-eslint (+20 more)

### Community 9 - "Web App tsconfig"
Cohesion: 0.09
Nodes (22): dependencies, drizzle-orm, pg, devDependencies, drizzle-kit, eslint, @toc/config, @types/node (+14 more)

### Community 10 - "Core Package Manifest"
Cohesion: 0.07
Nodes (26): 1. O que foi implementado, 2. Achado: `page.evaluate` rebentava sob `tsx` (bug real, corrigido), 3. Testes e verificação, 4. Ficheiros alterados, 5. Auto-revisão, 6. Preocupações / o que fica em aberto, Aberto, `apps/worker/scripts/recon-at.ts` (+18 more)

### Community 11 - "Worker Package Manifest"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 12 - "Web Auth & Pages"
Cohesion: 0.13
Nodes (27): Ctx, DELETE(), GET(), PATCH(), GET(), POST(), CompanyFormState, createCompanyAction() (+19 more)

### Community 13 - "Shared Base tsconfig"
Cohesion: 0.22
Nodes (11): ClassifiedFailure, classifyFailure(), estruturalPorEtapa(), outcomeDe(), outcomeDoLogin(), transitorioPorEtapa(), CLASSES, IvaOutcome (+3 more)

### Community 14 - "Shared Base tsconfig (variant)"
Cohesion: 0.12
Nodes (16): 10. Fora de escopo nesta base (YAGNI), 11. Riscos e pontos em aberto (herdados do contexto), 1. Objetivo desta base, 2. Arquitetura geral, 3. Stack, 4. Estrutura de pastas, 5.1 Auth / autorização, 5.2 Observabilidade / eventos correlacionados (+8 more)

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
Nodes (20): isPersistable(), normalizeScan(), persistableCompanies(), toCleanString(), toPositiveInt(), diff(), emptySummary(), planCompanyReconciliation() (+12 more)

### Community 20 - "Package tsconfig (worker)"
Cohesion: 0.29
Nodes (6): Banco, Convenções, Código, Fluxo de trabalho (Git), Observabilidade, TDD

### Community 21 - "Web Root Layout"
Cohesion: 0.40
Nodes (3): display, metadata, sans

### Community 25 - "Web Home Page"
Cohesion: 0.14
Nodes (14): 10. Glossário, 11. Pontos ainda em aberto (a confirmar com o cliente), 1. Resumo executivo, 2. Atores e stakeholders, 3. A plataforma TOConline, 4.1. O que já é automático (em lote, dentro do TOConline), 4.2. O gargalo (manual, cliente a cliente), 4. O processo atual (como o gabinete trabalha hoje) (+6 more)

### Community 35 - "Config Package"
Cohesion: 0.08
Nodes (25): Achados do revisor (verbatim), Causa raiz confirmada (por que a restruturação resolve, e o escape não seria necessário), Causa raiz identificada, Comandos executados e saída, Comandos executados e saída, Commit, Commit, Commit (+17 more)

### Community 36 - ".run"
Cohesion: 0.22
Nodes (6): IvaDocumentRunner, desfechoDoJob, markByOutcome(), RAZAO_POR_DESFECHO, AtCredentialSource, IvaDocumentJobPayload

### Community 37 - "Management Dashboard (planned)"
Cohesion: 0.11
Nodes (35): PageProps, CompanyForm(), EditTeamPage(), TeamForm(), capitalize(), dateFmt, formatDate(), TraceRow (+27 more)

### Community 42 - "CLAUDE.md — Automação de Guias Fiscais (TOConline)"
Cohesion: 0.18
Nodes (10): dependencies, @eslint/js, typescript-eslint, exports, ./eslint, ./tsconfig, name, private (+2 more)

### Community 43 - "Base do Projeto (Automação TOConline) — Implementation Plan"
Cohesion: 0.33
Nodes (5): compilerOptions, outDir, rootDir, extends, include

### Community 44 - "Arquitetura"
Cohesion: 0.20
Nodes (9): Arquitetura, Deploy, Fila de trabalho, Fronteiras dos pacotes, Módulo 1 — guia de pagamento do IVA, Por que dois deployables, Storage, Superfície de API (apps/web) (+1 more)

### Community 45 - "pull_request_template.md"
Cohesion: 0.33
Nodes (5): compilerOptions, outDir, rootDir, extends, include

### Community 46 - "README.md"
Cohesion: 0.10
Nodes (5): DbStore, InMemoryStore, SupabaseStore, EventRecord, TraceRecord

### Community 47 - "@toc/worker (scaffold)"
Cohesion: 0.40
Nodes (4): Checklist, Como testar, O que muda, Por quê

### Community 48 - "jobs queue consumed by worker"
Cohesion: 0.14
Nodes (26): abortar(), abrirContexto(), Argumentos, escutar(), escutarPagina(), etapa(), hostDe(), irPara() (+18 more)

### Community 49 - "Worker runs off Vercel (long-running process + real browser)"
Cohesion: 0.16
Nodes (23): Ctx, DELETE(), GET(), PATCH(), POST(), createTeamAction(), deleteTeamAction(), TeamFormState (+15 more)

### Community 50 - "Portal automation (TOConline, AT, Segurança Social, e-Fatura)"
Cohesion: 0.06
Nodes (29): AtCompanyHandle, AtPrecondition, AtSessionFactory, DeclarationRead, PaymentDocumentFetch, traceDoDashboard(), AGORA, build() (+21 more)

### Community 51 - "@toc/worker RPA worker (scaffold)"
Cohesion: 0.19
Nodes (13): BadgeTone, IVA_ROW_TONES, IvaRowState, ROW_STATE_META, rowStateMeta, SEVERITY_SHORT, SEVERITY_TONE, UI_STATE_META (+5 more)

### Community 52 - "TocCredentialForm.tsx"
Cohesion: 0.08
Nodes (24): 10. Storage com status 0, 11. Lookup da empresa engolia o erro, 12. Tela inicial com credencial inválida, 13. `portal_paused` inalcançável — ligado à UI, 14. Trace de job adiado, 15. Catch-all do loop, 1. `?team=` na tela inicial, 2. e2e navega com `?team=` (+16 more)

### Community 53 - "tenancy.smoke.test.ts"
Cohesion: 0.15
Nodes (10): documents, obligationPeriods, obligations, criadas, db, criadas, db, makeCompany() (+2 more)

### Community 54 - "apps/worker (Node + Playwright RPA)"
Cohesion: 0.18
Nodes (7): companies, integrationCredentials, jobStatus, jobs, criadas, db, pool

### Community 55 - "ObligationLedger"
Cohesion: 0.19
Nodes (17): GET(), naoEncontrado(), GET(), changePassword(), ChangePasswordPage(), DashboardLayout(), LogsPage(), TraceRow (+9 more)

### Community 56 - "domain.smoke.test.ts"
Cohesion: 0.08
Nodes (24): dependencies, drizzle-orm, @toc/db, devDependencies, eslint, @supabase/supabase-js, @toc/config, @types/node (+16 more)

### Community 57 - "JobQueue"
Cohesion: 0.09
Nodes (21): 1. `apps/worker/src/errors.ts` (acrescentado; nada removido), 1. Important — o catch-all do loop contornava a regra única, 2. `apps/worker/src/runner/classify-failure.ts` (novo, puro), 2. Important — `defer` sem guarda de estado, 3. `apps/worker/src/runner/ports.ts` (acrescentado; nada removido), 3. Arbitragem da preocupação #1 — `persist_rejected`, 4. `apps/worker/src/runner/job-queue.ts`, 4. Minor — exaustividade em `aplicar` (+13 more)

### Community 58 - "actions.ts"
Cohesion: 0.09
Nodes (21): 1. `declaration_not_submitted` agora abre e marca o período (Important), 2. Estado do `catch` agora vem da tabela, não de um `if` fixo (Important), 3. Mensagem fixa para erros genéricos — nunca `err.message` (Important), 4. Cleanup — `runner/document-guards.ts` apagado (controller-confirmed), 5. Minors, Cobertura da tabela `IVA_OUTCOMES` (41 códigos, spec §5), Comandos e resultados (fix round 1), Comandos executados e resultados (+13 more)

### Community 59 - "browser.ts"
Cohesion: 0.09
Nodes (21): 1. Important — precedência do `client_select` (aplicada), 2. Important — frase afirmativa para `mfa`, `passwordChange`, `passwordBlocked` (aplicada), 3. Important — `\b` no `alreadyPaid` (aplicada), 4. Minor — comentário obsoleto (aplicada), `apps/worker/src/at/classify-page.ts` (novo), `apps/worker/src/at/guards.ts` (novo), `apps/worker/src/at/parse-declarations.ts` (novo), `apps/worker/src/at/parse-fields.ts` (novo) (+13 more)

### Community 60 - "normalize.ts"
Cohesion: 0.09
Nodes (21): 1. O que foi implementado, 1. O teste do `acceptDownloads` não provava nada, 2. `server_error` inalcançável pelo código HTTP, 2. Testes e resultados, 3. Ficheiros alterados, 3. Seletor em falta escapava como `TimeoutError` cru, 4. Auto-revisão, 4. Menores (+13 more)

### Community 61 - "DbObligationLedger"
Cohesion: 0.15
Nodes (3): CredentialLookup, FakeCredentials, FakeCredentials

### Community 62 - "sinks.test.ts"
Cohesion: 0.09
Nodes (21): 10. Acessibilidade, 11. Fora de escopo (YAGNI), 12. Riscos e mitigação, 1. Objetivo, 2. Contexto e restrições, 3. Referência visual (DNA da Cliconta), 4.1 Cores, 4.2 Tipografia (Hanken Grotesk; display peso 500) (+13 more)

### Community 63 - "session.browser.test.ts"
Cohesion: 0.10
Nodes (19): 1. Refactors prévios, 2. Vitest no web, 3–5. Novos módulos, 6. `StatusBadge`, Auto-revisão, Commits, e2e — as falhas são ambientais e pré-existentes, Ficheiros alterados (+11 more)

### Community 64 - "iva-outcome-effects.ts"
Cohesion: 0.10
Nodes (19): 1. Important — `IVA_STAGES` duplicava a união `IvaStage` sem ligação aditiva, 1. O que implementei, 2. Important — `readIvaOutcome` sem ramo `deferred`, 2. O que testei e resultados, 3. Evidência de TDD (red → green, um ciclo por módulo), 3. Lacuna — `{n}` de `daily_cap_reached` sem campo de origem, 4. Conferências independentes da implementação, 5. Ficheiros alterados (+11 more)

### Community 65 - "RowDetailsDialog.tsx"
Cohesion: 0.11
Nodes (18): 1. `SupabaseDocumentStore`, 2. `DbObligationLedger`, 3. `DbCredentialSource` (extensão), 4. `DbAttemptGuard`, Achado 1+2 — regressão do estado do período, Achado 3 — `markCompanyAtInvalid` confiava no `team_id` do payload, Auto-revisão, Commits (+10 more)

### Community 66 - "document-store.ts"
Cohesion: 0.11
Nodes (17): 1. O que ficou implementado, 2. Testes e resultados, 3. Ficheiros alterados, 4. Auto-revisão, 5. Preocupações e notas para quem revê, Ainda por decidir (candidato a uma ronda seguinte), `apps/web/src/lib/documents/bulk.ts` (novo — lógica pura, testável), `apps/web/src/lib/documents/service.ts` (novo) (+9 more)

### Community 67 - "iva-fakes.ts"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 68 - "FakeLedger"
Cohesion: 0.12
Nodes (16): 1. `apps/web/src/app/api/documents/[id]/download/route.ts` (novo, 101 linhas), 1. Important — o `error` da consulta RLS era descartado, 2. `apps/web/src/app/(dashboard)/documentos/iva/page.tsx` (ligação mínima), 2. Minor — `obligation_period_id` fora do `select`, 3. `docs/event-logging.md`, 3. Minor — spec, 4. `apps/web/e2e/documentos-download.spec.ts` (novo, 7 casos), A suite inteira: verde, mas foi preciso perceber a flakiness (+8 more)

### Community 69 - "FakeRepo"
Cohesion: 0.12
Nodes (16): 1. `components/patterns/team-switcher.tsx` (novo, client), 2. `documentos/iva/page.tsx` (completa), 3. `RowDetailsDialog.tsx` (novo, client), 4. `FetchAllButton.tsx` (versão completa), 5. `FetchButton.tsx` + `actions.ts` (Adendas 2 e 3), 6. Funções puras novas (`lib/documents/present.ts` e `bulk.ts`), 7. `packages/core` — rótulos onde os rótulos vivem, 8. Seed + e2e + config (Adenda 4 e 5) (+8 more)

### Community 70 - "getSessionUser"
Cohesion: 0.12
Nodes (16): Cliconta Design System + Reformulação do Front-end — Implementation Plan, File Structure, Global Constraints, Self-Review (cobertura da spec), Task 10: Equipes (lista + form em Dialog + edição), Task 11: Admin / Usuários, Task 12: Verificação final, Task 1: Fundação — Tailwind v4, tokens, fontes, `cn` (+8 more)

### Community 71 - "credential-form.tsx"
Cohesion: 0.12
Nodes (15): Achados/decisões que valem nota, Alterações por ficheiro, `apps/worker/README.md`, `CLAUDE.md`, Commits, `docs/architecture.md`, `docs/context/project-context.md`, `docs/database.md` (+7 more)

### Community 72 - "ObligationLedger"
Cohesion: 0.13
Nodes (14): 1.1 `apps/web/src/components/integrations/credential-form.tsx` — `CredentialForm`, 1.2 `CredentialFormState` → `apps/web/src/lib/integrations/form-state.ts` (novo), 1.3 `metadata` na projeção segura (`apps/web/src/lib/integrations/service.ts`), 1.4 `/integracoes/at`, 1.5 Navegação e tela inicial, 1. O que foi implementado, 2.1 `apps/web/e2e/integracoes-at.spec.ts` (serial, 5 casos), 2.2 Evidência de TDD (red → green) (+6 more)

### Community 74 - "FakeDeclarations"
Cohesion: 0.13
Nodes (14): `credential.ts`, `document.ts`, `due-date.ts`, Ficheiros a criar (todos em `packages/core/src/domain/at/`) + barrel, Onde encaixa, `outcomes.ts`, `packages/core/src/domain/index.ts`, `packages/core/src/domain/types.ts` (extensão) (+6 more)

### Community 75 - "FakeGate"
Cohesion: 0.13
Nodes (14): dependsOn, outputs, cache, persistent, $schema, tasks, build, dev (+6 more)

### Community 76 - "AtCredentialSource"
Cohesion: 0.17
Nodes (11): `at/classify-page.ts` — classificador puro + snapshot, `at/guards.ts` — worker-side (lançam `AtTransientError`/`AtIntegrityError`), `at/parse-declarations.ts` — puro, `at/parse-fields.ts` — puro, `at/selectors.ts` — o ÚNICO ficheiro com seletores e URLs da AT, `at/wording.ts` — o ÚNICO ficheiro com regexes de redação, Ficheiros, Onde encaixa (+3 more)

### Community 77 - "FakeSessions"
Cohesion: 0.18
Nodes (10): 1. Refactors, 2. Vitest no web, 3. `apps/web/src/lib/documents/access.ts`, 4. `apps/web/src/lib/documents/outcomes.ts`, 5. `apps/web/src/lib/documents/present.ts` (pura, sem imports de Next), 6. `apps/web/src/components/patterns/status-badge.tsx`, Onde encaixa, Regras (+2 more)

### Community 80 - "clients (empresas do gabinete)"
Cohesion: 0.08
Nodes (30): ProfileRow, SessionUser, CookieToSet, updateSession(), config, proxy(), ChangePasswordGuardInput, shouldRedirectToChangePassword() (+22 more)

### Community 81 - "README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

### Community 82 - "@toc/worker (scaffold)"
Cohesion: 0.29
Nodes (6): Comandos, Correr o worker, Módulo 1 — guias de IVA (AT), Scripts manuais (Fase 0), @toc/worker, Variáveis de ambiente

### Community 87 - "layout.tsx"
Cohesion: 0.06
Nodes (32): 10. Observabilidade, 11. Fase 0 — Reconhecimento (o portão), 12. Fases de implementação (TDD red → green; cada fase termina com `pnpm lint && pnpm typecheck && pnpm test` verdes), 13. Verificação end-to-end, 14. Riscos e incógnitas (abertas até à F0), 15. Fora de escopo (explícito), 1. Objetivo, 2. Contexto e decisões com o utilizador (+24 more)

### Community 88 - "cn"
Cohesion: 0.15
Nodes (25): initialState, TeamFormProps, AuthLayout(), AuthLayoutProps, CredentialForm(), CredentialFormCopy, CredentialFormProps, formatDate() (+17 more)

### Community 89 - "Design System Cliconta + Reformulação do Front-end — Design"
Cohesion: 0.18
Nodes (10): 1. `components/patterns/team-switcher.tsx` (client), 2. Página `documentos/iva/page.tsx` (completa), 3. `RowDetailsDialog.tsx` (client), 4. `FetchAllButton.tsx` (client, versão completa), 5. Cópia adicional em `present.ts`/`outcomes.ts` se faltar (mantenha rótulos em core; aqui só textos de UI: mensagens de ação, banner, lote)., 6. e2e (acrescentar a `documentos-iva.spec.ts`), Adenda (do controlador, após a revisão da Task 11), Onde encaixa (+2 more)

### Community 90 - "components.json"
Cohesion: 0.18
Nodes (10): Adenda (do controlador), Migração manual `_iva_documents_rls.sql`, Onde encaixa, Ordem (TDD), Regras, Schema Drizzle, Smoke tests (`packages/db/test/iva-documents.smoke.test.ts`), `supabase/config.toml` (+2 more)

### Community 91 - "Cliconta Design System + Reformulação do Front-end — Implementation Plan"
Cohesion: 0.18
Nodes (10): 1. `apps/worker/src/errors.ts` (acrescentar; manter as classes existentes), 2. `apps/worker/src/runner/classify-failure.ts` (pura), 3. `apps/worker/src/runner/ports.ts` (acrescentar; não remover nada), 4. `apps/worker/src/runner/job-queue.ts`, 5. `apps/worker/src/runner/worker-loop.ts`, 6. `apps/worker/src/runner/portal-gate.ts`, 7. Compatibilidade, Onde encaixa (+2 more)

### Community 93 - "types.ts"
Cohesion: 0.36
Nodes (7): DocumentFieldWarning, CREDENTIAL_SCOPES, IvaDocumentJobResult, IvaResultKey, nonEmptyString(), parseIvaDocumentPayload(), ResultKeysCoverAll

### Community 94 - "browser.ts"
Cohesion: 0.11
Nodes (33): BatchProgress(), ACCESS_TARGET, batchProgress(), BatchProgressCounts, createdAtMs(), CREDENTIAL_OUTCOME_TARGET, credentialBanner, credentialLinkFor() (+25 more)

### Community 95 - "normalize.ts"
Cohesion: 0.35
Nodes (8): digitsOnly(), documentFieldsComplete(), NormalizedDocumentFields, normalizeDocumentFields(), parseAmount(), presentText(), RawDocumentFields, taxIdMatches()

### Community 97 - "Log (linha fina pendurada num event/trace)"
Cohesion: 0.24
Nodes (8): eventStatus, logLevel, traceStatus, triggerKind, events, logs, traces, db

### Community 98 - "AtFixtureServer"
Cohesion: 0.20
Nodes (9): 1. `apps/worker/src/sinks/document-store.ts` — `SupabaseDocumentStore implements DocumentStore`, 2. `apps/worker/src/sinks/obligation-ledger.ts` — `DbObligationLedger implements ObligationLedger` (drizzle, `Database` de `@toc/db`), 3. `apps/worker/src/sinks/credential-source.ts` — `DbCredentialSource` passa a `implements AtCredentialSource`, 4. `apps/worker/src/sinks/attempt-guard.ts` — `DbAttemptGuard implements AttemptGuard`, Adenda (do controlador), Onde encaixa, Regras, Task 7 — Sinks do Módulo 1: Storage, ledger de obrigações, credenciais (extensão), guarda de tentativas (+1 more)

### Community 99 - "selectors.test.ts"
Cohesion: 0.20
Nodes (9): 1. `apps/worker/src/browser/browser.ts`, 2. `apps/worker/src/at/session-acesso-gov.ts` — `AcessoGovAtSessions implements AtSessionFactory`, 3. `apps/worker/src/at/iva-declaration.ts` — `AtIvaDeclarationReader implements IvaDeclarationReader`, 4. `apps/worker/src/at/pdf-capture.ts`, 5. `apps/worker/src/at/payment-document.ts` — `AtPaymentDocumentFetcher implements PaymentDocumentFetcher`, 6. Fixtures e testes browser (`apps/worker/test/at/`, `describe.skipIf(process.env.SKIP_BROWSER_TESTS === "1")`), Onde encaixa, Regras (+1 more)

### Community 100 - "sidebar.tsx"
Cohesion: 0.20
Nodes (9): 1. `apps/worker/src/config/env.ts`, 2. `apps/worker/src/index.ts`, 3. `.env.example` (raiz), 4. `apps/worker/scripts/recon-at.ts`, 5. `apps/worker/scripts/seed-at-session.ts`, 6. Configuração de build/lint, Onde encaixa, Regras (+1 more)

### Community 109 - "Task 5 — `IvaDocumentRunner` (orquestração) + testes com fakes"
Cohesion: 0.22
Nodes (8): Ficheiro: `apps/worker/src/runner/iva-document-runner.ts`, `markByOutcome` (regra: a credencial é marcada pelo que o portal disse sobre ELA, nunca sobre a empresa), Onde encaixa, Ordem dos passos (cada saída antecipada passa por `closeEarly` com o mesmo `job.started`), Regras, Salvaguardas, Task 5 — `IvaDocumentRunner` (orquestração) + testes com fakes, Testes: `apps/worker/test/runner/iva-document-runner.test.ts`

### Community 110 - "AcessoGovAtSessions"
Cohesion: 0.23
Nodes (6): AcessoGovAtSessions, caminhosDe(), seguirODocumento(), CredentialScope, OpenedAtSession, PortalCredentials

### Community 111 - "Task 11 — Serviço de documentos (listar, enfileirar por empresa, enfileirar em lote) + página mínima + e2e de enfileiramento"
Cohesion: 0.25
Nodes (7): 1. `apps/web/src/lib/documents/service.ts`, 2. `apps/web/src/app/(dashboard)/documentos/iva/actions.ts`, 3. Página mínima `apps/web/src/app/(dashboard)/documentos/iva/page.tsx` (a versão completa é a Task 14 — aqui o mínimo para o e2e), 4. e2e `apps/web/e2e/documentos-iva.spec.ts` (serial; helper `login`; `DEMO_TEAM`), Onde encaixa, Regras, Task 11 — Serviço de documentos (listar, enfileirar por empresa, enfileirar em lote) + página mínima + e2e de enfileiramento

### Community 113 - "service.ts"
Cohesion: 0.25
Nodes (7): 1. `apps/web/src/app/api/documents/[id]/download/route.ts`, 2. Ligação na listagem (mínima; a Task 14 refina), 3. `docs/event-logging.md`, 4. e2e `apps/web/e2e/documentos-download.spec.ts`, Onde encaixa, Regras, Task 12 — Rota de download `GET /api/documents/[id]/download` + e2e

### Community 114 - "package.json"
Cohesion: 0.08
Nodes (23): dependencies, drizzle-orm, playwright, @supabase/supabase-js, @toc/core, @toc/db, devDependencies, eslint (+15 more)

### Community 115 - "session.ts"
Cohesion: 0.21
Nodes (14): fieldOf(), formatDatePt(), INVALID_REASON_LABELS, isDeferred(), IvaOutcomeRead, IvaOutcomeSpec, IvaSeverity, JobRowForOutcome (+6 more)

### Community 116 - "iva-sinks.test.ts"
Cohesion: 0.15
Nodes (8): db, equipasCriadas, ficheirosCriados, KEY, makeCompany(), makeCredential(), nextNif(), pool

### Community 117 - "Onda final de correções — Módulo 1 (uma só passagem)"
Cohesion: 0.29
Nodes (6): A — Portão vermelho: `pnpm test` (Crítico #1), B — Worker/web: correções importantes (#2, #4, #5) + menores baratos, C — Documentação e spec (T16 + deriva), D — Prettier (33 ficheiros desta branch, só esses), E — Verificação final, Onda final de correções — Módulo 1 (uma só passagem)

### Community 118 - "storage-state.ts"
Cohesion: 0.13
Nodes (6): ClaimedJob, JobHandler, JobOutcome, WorkerLoop, WorkerLoopDeps, FakeQueue

### Community 119 - "cn"
Cohesion: 0.33
Nodes (6): admin, apagarCredencialAt(), criarCredencialAt(), criarJobObtido(), limparFila(), rest()

### Community 120 - "Task 13 — `CredentialForm` genérico, página `/integracoes/at`, nav + e2e"
Cohesion: 0.29
Nodes (6): 1. `apps/web/src/components/integrations/credential-form.tsx` — `CredentialForm`, 2. `apps/web/src/app/(dashboard)/integracoes/at/page.tsx` + `actions.ts`, 3. e2e `apps/web/e2e/integracoes-at.spec.ts` (serial), Onde encaixa, Regras, Task 13 — `CredentialForm` genérico, página `/integracoes/at`, nav + e2e

### Community 121 - "session.browser.test.ts"
Cohesion: 0.15
Nodes (19): build(), comparePeriods(), match(), MONTH_BY_NAME, MONTH_NAME_PATTERNS, MONTH_NAMES_PT, MONTH_PATTERNS, monthPeriod() (+11 more)

### Community 122 - "Task 2 Report: Buckets de Storage (`guias` e `rpa-diagnostics`)"
Cohesion: 0.38
Nodes (8): companyStatus, contributorType, credentialStatus, documentStatus, integrationProvider, obligationFrequency, obligationKind, obligationPeriodStatus

### Community 123 - "types.ts"
Cohesion: 0.16
Nodes (5): backoffMs(), JobQueue, DbAttemptGuard, DbCredentialSource, Database

### Community 124 - "enums.ts"
Cohesion: 0.25
Nodes (11): decryptSecret(), encryptSecret(), generateEncryptionKey(), isEncryptedSecret(), MESSAGES, ParsedToken, parseToken(), resolveKey() (+3 more)

### Community 125 - "session-acesso-gov.browser.test.ts"
Cohesion: 0.18
Nodes (9): abrir(), contextos, empresa(), ESCOPO_CC, ESCOPO_EMPRESA, opcoesDeContexto, pedidos, provider() (+1 more)

### Community 126 - "supabase-store.test.ts"
Cohesion: 0.18
Nodes (7): LogRecord, fakeClient(), loggedAt, makeStore(), occurredAt, RecordedCall, startedAt

### Community 127 - "supabase-store.test.ts"
Cohesion: 0.06
Nodes (42): deleteAtCredentialAction(), saveAtCredentialAction(), deleteTocCredentialAction(), saveTocCredentialAction(), ScanFormState, startCompanyScanAction(), ScanPanel(), ScanPanelProps (+34 more)

### Community 128 - "tsconfig.test.json"
Cohesion: 0.33
Nodes (5): compilerOptions, noEmit, rootDir, extends, include

### Community 129 - "page.tsx"
Cohesion: 0.09
Nodes (42): FetchAllButtonProps, buildBulkRows(), BulkCompany, BulkCounts, BulkPlan, BulkPlanSummary, bulkRowsFromReads(), BulkRowsResult (+34 more)

### Community 130 - "index.ts"
Cohesion: 0.47
Nodes (3): appRole, teamStatus, teams

### Community 132 - "index.ts"
Cohesion: 0.27
Nodes (8): ErrorInput, EventInput, EventStatus, LogLevel, StartTraceInput, TraceStatus, TriggerKind, UserEventInput

### Community 133 - "task-1-brief.md"
Cohesion: 0.15
Nodes (6): OBLIGATION_KINDS, createdStorageObjectIds, createdTeamIds, createdUserIds, db, pool

### Community 135 - "auth-profiles.smoke.test.ts"
Cohesion: 0.33
Nodes (3): profiles, db, pool

### Community 136 - "browser.ts"
Cohesion: 0.33
Nodes (7): abortar(), lerChave(), main(), USO, assertAtHost(), PlaywrightBrowserOptions, installKeepNamesShim()

### Community 137 - "ObligationLedger"
Cohesion: 0.33
Nodes (8): cellAt(), COLUMN_KEYWORDS, DeclarationRow, findColumn(), parseDeclarationRows(), pickMostRecentDeclaration(), plain(), submissionRank()

### Community 139 - "tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, outDir, rootDir, extends, include

### Community 140 - "SDD ledger — plan: /Users/gabrieltorresbolognani/.claude/plans/construa-um-plano-completo-vast-clock.md"
Cohesion: 0.33
Nodes (5): Global constraints (bind every task; copied for reviewers), Pre-flight conflict scan, Progress, SDD ledger — plan: /Users/gabrieltorresbolognani/.claude/plans/construa-um-plano-completo-vast-clock.md, Task map (plan §10 steps → SDD tasks)

### Community 141 - "AtCredentialSource"
Cohesion: 0.40
Nodes (4): Alterações, Onde encaixa, Regras, Task 15 — Coluna "TOConline" em `/empresas`

### Community 142 - "PortalGate"
Cohesion: 0.35
Nodes (3): CompanyScanRunner, parsePayload(), TraceHandle

### Community 143 - "ports.ts"
Cohesion: 0.17
Nodes (12): assertDocumentBelongsTo(), assertPdfIntegrity(), assertPeriodMatches(), AtTransientError, ContextoDoJob, IvaRunnerDeps, IvaRunnerPolicy, AttemptGuard (+4 more)

### Community 144 - "ObservabilityStore"
Cohesion: 0.22
Nodes (3): ObservabilityStore, createEvent(), EventHandle

### Community 145 - "companies-grid.browser.test.ts"
Cohesion: 0.18
Nodes (3): InMemoryPortalGate, PortalGateOptions, PortalGate

### Community 146 - "AtSessionFactory"
Cohesion: 0.12
Nodes (21): allFields(), AtPageKind, AtPageSnapshot, classifyAtPage(), fingerprint(), hasNifField(), hasPasswordField(), hostOf() (+13 more)

### Community 147 - "validate.ts"
Cohesion: 0.40
Nodes (4): Alterações, Onde encaixa, Regras, Task 16 — Documentação do Módulo 1 + correções de docs obsoletos + graphify

### Community 148 - "FakeCredentials"
Cohesion: 0.40
Nodes (4): Formato, Objetivo, Regras, Task 1 — Spec do Módulo 1 em `docs/superpowers/specs/`

### Community 149 - "types.ts"
Cohesion: 0.23
Nodes (11): loadEnv(), MissingEnvError, parseAtAccessMode(), parsePositiveInt(), REQUIRED, WorkerEnv, criarSessoesAt(), log() (+3 more)

### Community 150 - "CompanyScanner"
Cohesion: 0.12
Nodes (11): CapturedPdf, capturePdf(), Estrategia, porDownload(), porPopup(), porResposta(), PdfVia, pdf() (+3 more)

### Community 151 - "Logger"
Cohesion: 0.16
Nodes (10): sleep(), countItems(), GridRead, GridReadOptions, readCompaniesGrid(), GridProjection, GridSource, projectGrid() (+2 more)

### Community 152 - "cn"
Cohesion: 0.16
Nodes (17): WaveMotif(), WaveMotifProps, FormFieldProps, Button(), ButtonProps, CardFooter(), DialogContent(), DialogDescription() (+9 more)

### Community 153 - "user-menu.tsx"
Cohesion: 0.14
Nodes (14): AppShellProps, NAV_ITEMS, NavItem, SidebarContent(), ROLE_LABELS, UserMenu(), Logo(), LogoProps (+6 more)

### Community 154 - "page.tsx"
Cohesion: 0.12
Nodes (26): AdminUsersPage(), GuiasIvaPage(), RowDetailsDialog(), EditCompanyPage(), EmpresasPage(), EquipesPage(), AtPage(), PageProps (+18 more)

### Community 155 - "enums.ts"
Cohesion: 0.20
Nodes (9): createTeam(), nn(), normalizeTeam(), TeamRepo, TeamServiceOutput, updateTeam(), validateTeamInput(), TeamInput (+1 more)

### Community 156 - "company-directory.ts"
Cohesion: 0.16
Nodes (12): OpenedSession, TocOnlineCredentials, TOCONLINE, assertTocHost(), PlaywrightTocSessions, REJECTION_NOTICE, TocOnlineOptions, PAGINA_LOGIN() (+4 more)

### Community 158 - "GridProjection"
Cohesion: 0.12
Nodes (12): AtAuthReason, AtIntegrityOutcome, AtTransientOutcome, InvalidCredentialsError, StructuralError, classificar(), estado(), SupabaseDocumentStore (+4 more)

### Community 159 - "service.ts"
Cohesion: 0.23
Nodes (7): CompanyRepo, CompanyServiceOutput, createCompany(), nn(), normalizeCompany(), updateCompany(), CompanyRecord

### Community 160 - "DbAttemptGuard"
Cohesion: 0.21
Nodes (7): ActionMeta, getTracer(), db, equipasCriadas, queue, createDb(), schema

### Community 161 - "due-date.ts"
Cohesion: 0.31
Nodes (12): addDays(), derivePaymentDueDate(), DueDateOptions, DueDates, easterSunday(), endMonthOf(), FIXED_HOLIDAYS, isoDate() (+4 more)

### Community 162 - "actions.ts"
Cohesion: 0.24
Nodes (10): fetchAllIvaDocumentsAction(), FetchAllState, fetchIvaDocumentAction(), FetchState, FetchAllButton(), FetchButton(), FetchButtonProps, RowDetailsDialogProps (+2 more)

### Community 163 - "AtPaymentDocumentFetcher"
Cohesion: 0.20
Nodes (5): firstGroup(), parseFieldsFromText(), PATTERNS, AtPaymentDocumentFetcher, RawPortalDocumentFields

### Community 164 - "credential.ts"
Cohesion: 0.26
Nodes (9): AccessCredentialSelection, CredentialCandidate, evaluate(), rejected(), selectAccessCredential(), CredentialStatus, atCompany, atTeam (+1 more)

### Community 165 - "obligation-ledger.ts"
Cohesion: 0.26
Nodes (4): PeriodState, daEquipa(), DbObligationLedger, semRegressao()

### Community 166 - "Emissor"
Cohesion: 0.22
Nodes (9): 1. Instalar e subir o Supabase local, 2. Variáveis de ambiente — dois ficheiros, dois leitores, 3. Aplicar migrations e seed, 4. Subir o dashboard, 5. Subir o worker, Desenvolvimento local, Requisitos, Scripts de reconhecimento (Fase 0 do Módulo 1) (+1 more)

### Community 167 - "sinks.test.ts"
Cohesion: 0.15
Nodes (12): chunk(), DbCompanyDirectory, tocMetadata(), motivoDaMarca(), db, equipasCriadas, KEY, makeCredential() (+4 more)

### Community 168 - "readiness.ts"
Cohesion: 0.33
Nodes (5): BulkRow, calendarMonth(), CONCLUSIVE_OUTCOMES, planBulkFetch(), ReadinessInput

### Community 169 - "document-store.ts"
Cohesion: 0.25
Nodes (8): Acesso a dados, Banco de dados, Bootstrap do admin, Documentos e Storage (Módulo 1), Fluxo de migrations, RLS, Seed local (Módulo 1), View `iva_documents_overview`

### Community 171 - "page.tsx"
Cohesion: 0.40
Nodes (5): EventRow, LogRow, renderEventTree(), TraceDetailPage(), TraceRow

### Community 172 - "actions.ts"
Cohesion: 0.50
Nodes (4): createUser(), CreateUserState, VALID_UI_ROLES, CreateUserForm()

### Community 173 - "CLAUDE.md — Automação de Guias Fiscais (TOConline)"
Cohesion: 0.29
Nodes (7): CLAUDE.md — Automação de Guias Fiscais (TOConline), Comandos essenciais, Convenções técnicas, Estrutura, graphify, Mapa da documentação, Regras de trabalho

### Community 175 - "Tabelas (base)"
Cohesion: 0.33
Nodes (6): Auth / autorização, Domínio (esqueleto, enums extensíveis), Multi-tenant (equipe = gabinete), Observabilidade, Orquestração, Tabelas (base)

### Community 177 - "Automação de Guias Fiscais (TOConline)"
Cohesion: 0.33
Nodes (6): Automação de Guias Fiscais (TOConline), Comandos, Estrutura, Requisitos, Setup rápido, Stack

## Knowledge Gaps
- **978 isolated node(s):** `$schema`, `style`, `rsc`, `tsx`, `config` (+973 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **26 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `cn` to `cn`, `user-menu.tsx`, `Management Dashboard (planned)`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Why does `AppShell()` connect `Web App Dependencies` to `user-menu.tsx`, `ObligationLedger`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **What connects `$schema`, `style`, `rsc` to the rest of the system?**
  _981 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Observability Tracer/Logger` be split into smaller, more focused modules?**
  _Cohesion score 0.14130434782608695 - nodes in this community are weakly interconnected._
- **Should `DB Schema (Drizzle)` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._
- **Should `Observability Stores & DB Client` be split into smaller, more focused modules?**
  _Cohesion score 0.1010752688172043 - nodes in this community are weakly interconnected._
- **Should `Web App Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._