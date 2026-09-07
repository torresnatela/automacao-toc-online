# Graph Report - automacao-toc-online  (2026-09-06)

## Corpus Check
- 327 files · ~325,654 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2160 nodes · 4771 edges · 140 communities (113 shown, 27 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 14 edges (avg confidence: 0.69)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5243ba15`
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
- tenancy.smoke.test.ts
- iva-outcome-effects.ts
- middleware.ts
- document-store.ts
- iva-fakes.ts
- FakeLedger
- FakeRepo
- getSessionUser
- page.tsx
- RowDetailsDialog.tsx
- obligation-ledger.ts
- credential-form.tsx
- document-store.ts
- Módulo 1 — Rota A: guia do IVA via **Acesso Direto do TOConline** (extensão TOConline Connect) — Design
- credential-source.ts
- Conventional Commits
- Feature branches + PR + CI
- clients (empresas do gabinete)
- outcomes.ts
- credential.ts
- Logger
- cn
- env.ts
- document.ts
- normalize.ts
- postcss.config.mjs
- parse-fields.ts
- browser.ts
- page.tsx
- InMemoryStore (testes sem banco)
- createDb
- page.tsx
- supabase-store.test.ts
- Banco de dados
- ObservabilityStore (interface saveTrace/saveEvent/saveLog)
- Plano de implementação — Base do Projeto
- Criptografia de credenciais (planejada, não implementada)
- Roles app_role (viewer/operator/admin)
- Design — Base do Projeto (spec aprovado)
- Fora de escopo nesta base (YAGNI)
- PR Checklist (TDD, lint/typecheck/test, migrations, no secrets)
- pnpm workspace config (apps/*, packages/*)
- startAction
- actions.ts
- iva-fakes.ts
- manifest.json
- readiness.ts
- session.ts
- iva-sinks.test.ts
- EventHandle
- seed-at-session.ts
- cn
- Módulo 1 — guias de IVA (AT)
- session.browser.test.ts
- Task 2 Report: Buckets de Storage (`guias` e `rpa-diagnostics`)
- auth-profiles.smoke.test.ts
- enums.ts
- contentScript.js
- page.tsx
- Tabelas (base)
- StartedAction
- ObservabilityStore
- AtSessionFactory
- Logger
- company-directory.ts
- integracoes-at.spec.ts

## God Nodes (most connected - your core abstractions)
1. `cn()` - 60 edges
2. `Database` - 39 edges
3. `getSessionUser()` - 30 edges
4. `getSupabaseServerClient()` - 30 edges
5. `AtAccessMode` - 25 edges
6. `getSupabaseAdminClient()` - 24 edges
7. `StructuralError` - 24 edges
8. `TocDirectAccessAtSessions` - 22 edges
9. `GuiasIvaPage()` - 21 edges
10. `requireRole()` - 21 edges

## Surprising Connections (you probably didn't know these)
- `LastFetch` --references--> `IvaOutcome`  [EXTRACTED]
  apps/web/src/lib/documents/bulk.ts → packages/core/src/domain/at/outcomes.ts
- `ContextoDoJob` --references--> `AtAccessMode`  [EXTRACTED]
  apps/worker/src/runner/iva-document-runner.ts → packages/core/src/domain/at/types.ts
- `makeCredential()` --calls--> `encryptSecret()`  [EXTRACTED]
  apps/worker/test/sinks/iva-sinks.test.ts → packages/core/src/crypto/secret-box.ts
- `planCompanyReconciliation()` --indirect_call--> `company()`  [INFERRED]
  packages/core/src/domain/toconline/reconcile.ts → apps/worker/test/toconline/guards.test.ts
- `main()` --calls--> `createDb()`  [EXTRACTED]
  apps/worker/src/index.ts → packages/db/src/client.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Next.js scaffold default assets** — apps_web_public_file_icon, apps_web_public_globe_icon, apps_web_public_next_logo, apps_web_public_vercel_logo, apps_web_public_window_icon [INFERRED 0.85]

## Communities (140 total, 27 thin omitted)

### Community 0 - "Observability Tracer/Logger"
Cohesion: 0.07
Nodes (35): CompanyRepo, CompanyServiceOutput, createCompany(), nn(), normalizeCompany(), updateCompany(), CompanyField, CompanyFieldErrors (+27 more)

### Community 1 - "Architecture & Domain Overview"
Cohesion: 0.18
Nodes (11): Checklist "sempre logar", Correlação (o "correlationID"), Evento de usuário no app web (login/logout), Fluxo de sistema / integração, Modelo (tabelas em `packages/db/src/schema/observability.ts`), Observabilidade: o módulo de logs, Os dois tipos de evento, Receitas (+3 more)

### Community 2 - "DB Schema (Drizzle)"
Cohesion: 0.05
Nodes (42): dependsOn, outputs, cache, persistent, $schema, tasks, build, dev (+34 more)

### Community 3 - "Observability Stores & DB Client"
Cohesion: 0.11
Nodes (28): AtFixtureMode, AtFixtureServer, AtFixtureState, DECLARACOES, fechar(), FORMULARIO_LOGIN(), html(), lerCookies() (+20 more)

### Community 4 - "Web App Dependencies"
Cohesion: 0.05
Nodes (39): AppShell(), dependencies, class-variance-authority, clsx, lucide-react, next, @radix-ui/react-dialog, @radix-ui/react-dropdown-menu (+31 more)

### Community 5 - "Database"
Cohesion: 0.16
Nodes (17): gerarPdfSintetico(), NIFS, padroesDeHost(), SENHAS, abrirSessao(), apontada(), empresa(), provider() (+9 more)

### Community 6 - "Fiscal Domain & RLS"
Cohesion: 0.08
Nodes (23): dependencies, drizzle-orm, playwright, @supabase/supabase-js, @toc/core, @toc/db, devDependencies, eslint (+15 more)

### Community 7 - "Turborepo & Lint Config"
Cohesion: 0.22
Nodes (5): firstGroup(), parseFieldsFromText(), PATTERNS, AtPaymentDocumentFetcher, RawPortalDocumentFields

### Community 8 - "Root Package Scripts"
Cohesion: 0.09
Nodes (22): dependencies, drizzle-orm, pg, devDependencies, drizzle-kit, eslint, @toc/config, @types/node (+14 more)

### Community 9 - "Web App tsconfig"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 10 - "Core Package Manifest"
Cohesion: 0.11
Nodes (14): CompanyDirectory, CredentialLookup, UpsertReport, chunk(), DbCompanyDirectory, tocMetadata(), build(), FakeCredentials (+6 more)

### Community 11 - "Worker Package Manifest"
Cohesion: 0.12
Nodes (16): 10. Fora de escopo nesta base (YAGNI), 11. Riscos e pontos em aberto (herdados do contexto), 1. Objetivo desta base, 2. Arquitetura geral, 3. Stack, 4. Estrutura de pastas, 5.1 Auth / autorização, 5.2 Observabilidade / eventos correlacionados (+8 more)

### Community 12 - "Web Auth & Pages"
Cohesion: 0.14
Nodes (24): Ctx, DELETE(), GET(), PATCH(), GET(), POST(), createCompanyAction(), deleteCompanyAction() (+16 more)

### Community 13 - "Shared Base tsconfig"
Cohesion: 0.06
Nodes (33): 10. Observabilidade, 11. Fase 0 — Reconhecimento (o portão), 12. Fases de implementação (TDD red → green; cada fase termina com `pnpm lint && pnpm typecheck && pnpm test` verdes), 13. Verificação end-to-end, 14. Riscos e incógnitas (abertas até à F0), 15. Fora de escopo (explícito), 1. Objetivo, 2. Contexto e decisões com o utilizador (+25 more)

### Community 14 - "Shared Base tsconfig (variant)"
Cohesion: 0.12
Nodes (13): AuthenticatedTocSession, CompanyScanner, sleep(), countItems(), GridRead, GridReadOptions, readCompaniesGrid(), GridProjection (+5 more)

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
Cohesion: 0.06
Nodes (26): DeclarationRead, ObligationLedger, PaymentDocumentFetch, PeriodState, traceDoDashboard(), AGORA, build(), BuildOptions (+18 more)

### Community 20 - "Package tsconfig (worker)"
Cohesion: 0.07
Nodes (27): CLAUDE.md — Automação de Guias Fiscais (TOConline), Comandos essenciais, Convenções técnicas, Estrutura, graphify, Mapa da documentação, Regras de trabalho, 10. Glossário (+19 more)

### Community 21 - "Web Root Layout"
Cohesion: 0.40
Nodes (3): display, metadata, sans

### Community 25 - "Web Home Page"
Cohesion: 0.17
Nodes (5): FileStorageStateStore, InMemoryStorageStateStore, safeName(), SavedSession, dirs

### Community 26 - "Worker Entrypoint"
Cohesion: 0.18
Nodes (10): dependencies, @eslint/js, typescript-eslint, exports, ./eslint, ./tsconfig, name, private (+2 more)

### Community 35 - "Config Package"
Cohesion: 0.21
Nodes (11): OpenedSession, TocOnlineCredentials, assertTocHost(), loginOnPage(), looksRejected(), REJECTION_NOTICE, submitLogin(), TocLoginOptions (+3 more)

### Community 36 - ".run"
Cohesion: 0.12
Nodes (11): CapturedPdf, capturePdf(), Estrategia, porDownload(), porPopup(), porResposta(), PdfVia, pdf() (+3 more)

### Community 37 - "Management Dashboard (planned)"
Cohesion: 0.14
Nodes (30): PageProps, capitalize(), dateFmt, formatDate(), TraceRow, TracesPage(), DataTable(), TableBody() (+22 more)

### Community 42 - "CLAUDE.md — Automação de Guias Fiscais (TOConline)"
Cohesion: 0.25
Nodes (11): allFields(), AtPageKind, classifyAtPage(), fingerprint(), hasNifField(), hasPasswordField(), hostOf(), maskDigits() (+3 more)

### Community 43 - "Base do Projeto (Automação TOConline) — Implementation Plan"
Cohesion: 0.20
Nodes (9): Arquitetura, Deploy, Fila de trabalho, Fronteiras dos pacotes, Módulo 1 — guia de pagamento do IVA, Por que dois deployables, Storage, Superfície de API (apps/web) (+1 more)

### Community 44 - "Arquitetura"
Cohesion: 0.07
Nodes (40): deleteAtCredentialAction(), saveAtCredentialAction(), deleteTocCredentialAction(), saveTocCredentialAction(), ScanFormState, startCompanyScanAction(), CredentialFormState, Admin (+32 more)

### Community 45 - "pull_request_template.md"
Cohesion: 0.17
Nodes (7): esperarServiceWorker(), lerManifest(), LoadedExtension, PersistentChromiumBrowser, PersistentChromiumOptions, PersistentContextProvider, EXTENSAO

### Community 46 - "README.md"
Cohesion: 0.11
Nodes (11): DbStore, SupabaseStore, EventRecord, LogRecord, TraceRecord, fakeClient(), loggedAt, makeStore() (+3 more)

### Community 47 - "@toc/worker (scaffold)"
Cohesion: 0.33
Nodes (6): Banco, Convenções, Código, Fluxo de trabalho (Git), Observabilidade, TDD

### Community 48 - "jobs queue consumed by worker"
Cohesion: 0.26
Nodes (9): AccessCredentialSelection, CredentialCandidate, evaluate(), rejected(), selectAccessCredential(), CredentialStatus, atCompany, atTeam (+1 more)

### Community 49 - "Worker runs off Vercel (long-running process + real browser)"
Cohesion: 0.13
Nodes (20): isPersistable(), normalizeScan(), persistableCompanies(), toCleanString(), toPositiveInt(), diff(), emptySummary(), planCompanyReconciliation() (+12 more)

### Community 50 - "Portal automation (TOConline, AT, Segurança Social, e-Fatura)"
Cohesion: 0.12
Nodes (6): ClaimedJob, JobHandler, JobOutcome, WorkerLoop, WorkerLoopDeps, FakeQueue

### Community 51 - "@toc/worker RPA worker (scaffold)"
Cohesion: 0.09
Nodes (17): TocDirectAccessAtSessions, abrir(), empresa(), ESCOPO, EXTENSAO, pedidos, sessions(), tocUrl() (+9 more)

### Community 52 - "TocCredentialForm.tsx"
Cohesion: 0.20
Nodes (17): GET(), naoEncontrado(), changePassword(), ChangePasswordPage(), DashboardLayout(), LogsPage(), TraceRow, signIn() (+9 more)

### Community 53 - "tenancy.smoke.test.ts"
Cohesion: 0.15
Nodes (23): Ctx, DELETE(), GET(), PATCH(), GET(), POST(), createTeamAction(), deleteTeamAction() (+15 more)

### Community 54 - "apps/worker (Node + Playwright RPA)"
Cohesion: 0.18
Nodes (7): companies, integrationCredentials, jobStatus, jobs, criadas, db, pool

### Community 55 - "ObligationLedger"
Cohesion: 0.18
Nodes (12): AtIvaDeclarationReader, cellAt(), COLUMN_KEYWORDS, DeclarationRow, findColumn(), parseDeclarationRows(), pickMostRecentDeclaration(), plain() (+4 more)

### Community 56 - "domain.smoke.test.ts"
Cohesion: 0.08
Nodes (24): dependencies, drizzle-orm, @toc/db, devDependencies, eslint, @supabase/supabase-js, @toc/config, @types/node (+16 more)

### Community 57 - "JobQueue"
Cohesion: 0.33
Nodes (5): compilerOptions, outDir, rootDir, extends, include

### Community 58 - "actions.ts"
Cohesion: 0.33
Nodes (5): compilerOptions, outDir, rootDir, extends, include

### Community 59 - "browser.ts"
Cohesion: 0.33
Nodes (5): compilerOptions, noEmit, rootDir, extends, include

### Community 60 - "normalize.ts"
Cohesion: 0.38
Nodes (8): companyStatus, contributorType, credentialStatus, documentStatus, integrationProvider, obligationFrequency, obligationKind, obligationPeriodStatus

### Community 61 - "DbObligationLedger"
Cohesion: 0.16
Nodes (3): markByOutcome(), AtCredentialSource, FakeCredentials

### Community 62 - "sinks.test.ts"
Cohesion: 0.09
Nodes (21): 10. Acessibilidade, 11. Fora de escopo (YAGNI), 12. Riscos e mitigação, 1. Objetivo, 2. Contexto e restrições, 3. Referência visual (DNA da Cliconta), 4.1 Cores, 4.2 Tipografia (Hanken Grotesk; display peso 500) (+13 more)

### Community 63 - "tenancy.smoke.test.ts"
Cohesion: 0.15
Nodes (10): documents, obligationPeriods, obligations, criadas, db, criadas, db, makeCompany() (+2 more)

### Community 64 - "iva-outcome-effects.ts"
Cohesion: 0.33
Nodes (5): compilerOptions, outDir, rootDir, extends, include

### Community 65 - "middleware.ts"
Cohesion: 0.11
Nodes (13): DocumentStore, classificar(), estado(), SupabaseDocumentStore, db, doc(), equipasCriadas, ficheirosCriados (+5 more)

### Community 66 - "document-store.ts"
Cohesion: 0.40
Nodes (4): Checklist, Como testar, O que muda, Por quê

### Community 67 - "iva-fakes.ts"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 68 - "FakeLedger"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

### Community 69 - "FakeRepo"
Cohesion: 0.16
Nodes (20): DESTINO_POR_OMISSAO, execFileAsync, main(), terminar(), InstalledExtension, installFromChromeProfiles(), installFromCrx(), lerManifest() (+12 more)

### Community 70 - "getSessionUser"
Cohesion: 0.12
Nodes (16): Cliconta Design System + Reformulação do Front-end — Implementation Plan, File Structure, Global Constraints, Self-Review (cobertura da spec), Task 10: Equipes (lista + form em Dialog + edição), Task 11: Admin / Usuários, Task 12: Verificação final, Task 1: Fundação — Tailwind v4, tokens, fontes, `cn` (+8 more)

### Community 71 - "page.tsx"
Cohesion: 0.06
Nodes (66): initialState, RowDetailsDialog(), CompanyFormState, CompanyFormProps, TeamFormState, TeamFormProps, PageProps, RESULT_LABELS (+58 more)

### Community 72 - "RowDetailsDialog.tsx"
Cohesion: 0.24
Nodes (8): eventStatus, logLevel, traceStatus, triggerKind, events, logs, traces, db

### Community 73 - "obligation-ledger.ts"
Cohesion: 0.17
Nodes (10): abortar(), lerChave(), main(), USO, assertAtHost(), PlaywrightBrowser, PlaywrightBrowserOptions, installKeepNamesShim() (+2 more)

### Community 74 - "credential-form.tsx"
Cohesion: 0.10
Nodes (18): AtPageSnapshot, snapshotPage(), followDocument(), AcessoGovAtSessions, caminhosDe(), CaminhosDoPortal, FAMILIA_DE_LOGIN, SessaoAberta (+10 more)

### Community 75 - "document-store.ts"
Cohesion: 0.18
Nodes (9): abrir(), contextos, empresa(), ESCOPO_CC, ESCOPO_EMPRESA, opcoesDeContexto, pedidos, provider() (+1 more)

### Community 76 - "Módulo 1 — Rota A: guia do IVA via **Acesso Direto do TOConline** (extensão TOConline Connect) — Design"
Cohesion: 0.11
Nodes (17): 10. Riscos, 11. Fora de escopo, 1. Objetivo, 2. Decisões fechadas com o utilizador, 3. Achados que moldam o desenho, 4. Arquitetura, 5.1 Browser persistente — `apps/worker/src/browser/persistent-chromium.ts`, 5.2 Extensão portátil — `apps/worker/scripts/install-toconline-connect.ts` (+9 more)

### Community 77 - "credential-source.ts"
Cohesion: 0.12
Nodes (8): JobQueue, DbAttemptGuard, DbCredentialSource, motivoDaMarca(), daEquipa(), DbObligationLedger, semRegressao(), Database

### Community 80 - "clients (empresas do gabinete)"
Cohesion: 0.08
Nodes (29): ProfileRow, CookieToSet, updateSession(), config, proxy(), ChangePasswordGuardInput, shouldRedirectToChangePassword(), generateTempPassword() (+21 more)

### Community 81 - "outcomes.ts"
Cohesion: 0.12
Nodes (19): FetchAllButtonProps, FetchButtonProps, RowDetailsDialogProps, BulkCounts, BulkPlanSummary, BadgeTone, IVA_ROW_TONES, IvaRowState (+11 more)

### Community 82 - "credential.ts"
Cohesion: 0.14
Nodes (25): abortar(), abrirContexto(), Argumentos, escutar(), escutarPagina(), etapa(), EXTENSAO_POR_OMISSAO, hostDe() (+17 more)

### Community 87 - "Logger"
Cohesion: 0.22
Nodes (4): Logger, ObservabilityStore, createEvent(), LogLevel

### Community 88 - "cn"
Cohesion: 0.19
Nodes (17): AdminUsersPage(), CompanyForm(), EditCompanyPage(), EmpresasPage(), EquipesPage(), AtPage(), PageProps, TocOnlinePage() (+9 more)

### Community 89 - "env.ts"
Cohesion: 0.10
Nodes (12): loadEnv(), MissingEnvError, parsePositiveInt(), REQUIRED, WorkerEnv, log(), main(), InMemoryPortalGate (+4 more)

### Community 90 - "document.ts"
Cohesion: 0.35
Nodes (8): digitsOnly(), documentFieldsComplete(), NormalizedDocumentFields, normalizeDocumentFields(), parseAmount(), presentText(), RawDocumentFields, taxIdMatches()

### Community 94 - "browser.ts"
Cohesion: 0.10
Nodes (39): BatchProgress(), GuiasIvaPage(), rowStateMeta, ACCESS_LABEL, ACCESS_TARGET, accessHint(), batchProgress(), BatchProgressCounts (+31 more)

### Community 95 - "page.tsx"
Cohesion: 0.20
Nodes (10): 1. Instalar e subir o Supabase local, 2. Variáveis de ambiente — dois ficheiros, dois leitores, 3. Aplicar migrations e seed, 4. Subir o dashboard, 5. Subir o worker, Desenvolvimento local, Requisitos, Rota A — Acesso Direto do TOConline (extensão TOConline Connect) (+2 more)

### Community 97 - "createDb"
Cohesion: 0.48
Nodes (5): classifyDirectAccessSignals(), classifyDirectAccessText(), DIRECT_ACCESS_WORDING, DirectAccessPageKind, DirectAccessSignals

### Community 98 - "page.tsx"
Cohesion: 0.40
Nodes (5): EventRow, LogRow, renderEventTree(), TraceDetailPage(), TraceRow

### Community 99 - "supabase-store.test.ts"
Cohesion: 0.12
Nodes (13): InvalidCredentialsError, StructuralError, ScanOutcome, ScanPayload, ScanRunnerDeps, AttemptGuard, CredentialSource, TocSessionFactory (+5 more)

### Community 100 - "Banco de dados"
Cohesion: 0.25
Nodes (8): Acesso a dados, Banco de dados, Bootstrap do admin, Documentos e Storage (Módulo 1), Fluxo de migrations, RLS, Seed local (Módulo 1), View `iva_documents_overview`

### Community 109 - "startAction"
Cohesion: 0.47
Nodes (5): createUser(), CreateUserState, VALID_UI_ROLES, CreateUserForm(), startAction()

### Community 110 - "actions.ts"
Cohesion: 0.27
Nodes (10): fetchAllIvaDocumentsAction(), FetchAllState, fetchIvaDocumentAction(), FetchState, FetchAllButton(), FetchButton(), accessFromForm(), forceFromForm() (+2 more)

### Community 111 - "iva-fakes.ts"
Cohesion: 0.47
Nodes (5): PAGINA_LOGIN(), provider(), sessions(), startServer(), visitas

### Community 113 - "manifest.json"
Cohesion: 0.20
Nodes (9): background, service_worker, content_scripts, description, host_permissions, manifest_version, name, permissions (+1 more)

### Community 114 - "readiness.ts"
Cohesion: 0.33
Nodes (5): BulkRow, calendarMonth(), CONCLUSIVE_OUTCOMES, planBulkFetch(), ReadinessInput

### Community 115 - "session.ts"
Cohesion: 0.12
Nodes (27): ClassifiedFailure, RAZAO_POR_DESFECHO, DocumentFieldWarning, fieldOf(), formatDatePt(), INVALID_REASON_LABELS, isDeferred(), IVA_OUTCOME_CODES (+19 more)

### Community 116 - "iva-sinks.test.ts"
Cohesion: 0.13
Nodes (9): ActionMeta, getTracer(), StartedAction, backoffMs(), db, equipasCriadas, queue, createDb() (+1 more)

### Community 118 - "seed-at-session.ts"
Cohesion: 0.47
Nodes (3): appRole, teamStatus, teams

### Community 119 - "cn"
Cohesion: 0.22
Nodes (8): admin, apagarCredencialAt(), apagarCredencialToconline(), criarCredencialAt(), criarCredencialToconline(), criarJobObtido(), limparFila(), rest()

### Community 120 - "Módulo 1 — guias de IVA (AT)"
Cohesion: 0.33
Nodes (6): Comandos, Correr o worker, Módulo 1 — guias de IVA (AT), Scripts manuais (Fase 0), @toc/worker, Variáveis de ambiente

### Community 121 - "session.browser.test.ts"
Cohesion: 0.11
Nodes (31): addDays(), derivePaymentDueDate(), DueDateOptions, DueDates, easterSunday(), endMonthOf(), FIXED_HOLIDAYS, isoDate() (+23 more)

### Community 122 - "Task 2 Report: Buckets de Storage (`guias` e `rpa-diagnostics`)"
Cohesion: 0.15
Nodes (6): DOCUMENT_STATUSES, createdStorageObjectIds, createdTeamIds, createdUserIds, db, pool

### Community 123 - "auth-profiles.smoke.test.ts"
Cohesion: 0.33
Nodes (3): profiles, db, pool

### Community 124 - "enums.ts"
Cohesion: 0.15
Nodes (19): db, equipasCriadas, KEY, makeCredential(), makeTeam(), nextNif(), pool, scanned() (+11 more)

### Community 129 - "page.tsx"
Cohesion: 0.10
Nodes (41): requireWriterOn(), buildBulkRows(), BulkCompany, BulkPlan, bulkRowsFromReads(), BulkRowsResult, companyForEnqueue(), credentialForReadiness() (+33 more)

### Community 130 - "Tabelas (base)"
Cohesion: 0.33
Nodes (6): Auth / autorização, Domínio (esqueleto, enums extensíveis), Multi-tenant (equipe = gabinete), Observabilidade, Orquestração, Tabelas (base)

### Community 133 - "StartedAction"
Cohesion: 0.29
Nodes (6): 1. Extensão TOConline Connect (v2.1, `lbcpogheaekofocmhfbidfkimgkfenkp`), 2. Aplicação do TOConline, 3. Ensaio da ação DPIVA contra 8 empresas reais (2026-09-06, noite), 4. O que ainda falta observar (próximo ensaio, com a AT a responder), 5. Go/no-go, Fase 0 — Reconhecimento da rota A (Acesso Direto do TOConline) — 2026-09-06

### Community 144 - "ObservabilityStore"
Cohesion: 0.23
Nodes (9): IvaRunnerDeps, Tracer, ErrorInput, EventInput, EventStatus, StartTraceInput, TraceStatus, TriggerKind (+1 more)

### Community 146 - "AtSessionFactory"
Cohesion: 0.13
Nodes (21): assertDocumentBelongsTo(), assertPdfIntegrity(), assertPeriodMatches(), assertSessionBelongsTo(), AtAuthError, AtAuthReason, AtIntegrityError, AtIntegrityOutcome (+13 more)

### Community 151 - "Logger"
Cohesion: 0.19
Nodes (6): CompanyScanRunner, parsePayload(), IvaDocumentRunner, desfechoDoJob, IvaDocumentJobPayload, TraceHandle

### Community 156 - "company-directory.ts"
Cohesion: 0.27
Nodes (6): AT, AtOptions, TOC_DIRECT_ACCESS, EstadoDaApp, SessaoToc, TocDirectAccessOptions

## Knowledge Gaps
- **634 isolated node(s):** `1. Extensão TOConline Connect (v2.1, `lbcpogheaekofocmhfbidfkimgkfenkp`)`, `2. Aplicação do TOConline`, `3. Ensaio da ação DPIVA contra 8 empresas reais (2026-09-06, noite)`, `4. O que ainda falta observar (próximo ensaio, com a AT a responder)`, `5. Go/no-go` (+629 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **27 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AppShell()` connect `Web App Dependencies` to `TocCredentialForm.tsx`, `page.tsx`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **What connects `1. Extensão TOConline Connect (v2.1, `lbcpogheaekofocmhfbidfkimgkfenkp`)`, `2. Aplicação do TOConline`, `3. Ensaio da ação DPIVA contra 8 empresas reais (2026-09-06, noite)` to the rest of the system?**
  _637 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Observability Tracer/Logger` be split into smaller, more focused modules?**
  _Cohesion score 0.06610169491525424 - nodes in this community are weakly interconnected._
- **Should `DB Schema (Drizzle)` be split into smaller, more focused modules?**
  _Cohesion score 0.045454545454545456 - nodes in this community are weakly interconnected._
- **Should `Observability Stores & DB Client` be split into smaller, more focused modules?**
  _Cohesion score 0.10574712643678161 - nodes in this community are weakly interconnected._
- **Should `Web App Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Fiscal Domain & RLS` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._