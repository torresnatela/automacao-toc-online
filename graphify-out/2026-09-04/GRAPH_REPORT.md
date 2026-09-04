# Graph Report - automacao-toc-online-main  (2026-09-04)

## Corpus Check
- 337 files · ~242,152 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1998 nodes · 3286 edges · 155 communities (112 shown, 43 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.66)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `50537c8f`
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
- normalize.ts
- InMemoryStore (testes sem banco)
- Log (linha fina pendurada num event/trace)
- AtFixtureServer
- sidebar.tsx
- ObservabilityStore (interface saveTrace/saveEvent/saveLog)
- Plano de implementação — Base do Projeto
- Criptografia de credenciais (planejada, não implementada)
- Roles app_role (viewer/operator/admin)
- Design — Base do Projeto (spec aprovado)
- Fora de escopo nesta base (YAGNI)
- PR Checklist (TDD, lint/typecheck/test, migrations, no secrets)
- pnpm workspace config (apps/*, packages/*)
- service.ts
- package.json
- session.ts
- storage-state.ts
- cn
- session.browser.test.ts
- Task 2 Report: Buckets de Storage (`guias` e `rpa-diagnostics`)
- types.ts
- enums.ts
- getSupabaseAdminClient
- supabase-store.test.ts
- tsconfig.test.json
- page.tsx
- index.ts
- task-1-brief.md
- build
- ObligationLedger
- tsconfig.json
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
- Logger
- page.tsx
- enums.ts
- company-directory.ts
- integracoes-at.spec.ts
- DbAttemptGuard
- AtPaymentDocumentFetcher
- payment-document.browser.test.ts
- service.test.ts

## God Nodes (most connected - your core abstractions)
1. `cn()` - 60 edges
2. `getSessionUser()` - 27 edges
3. `AcessoGovAtSessions` - 17 edges
4. `getSupabaseServerClient()` - 17 edges
5. `ObservabilityStore` - 17 edges
6. `Módulo 1: Guia de Pagamento do IVA (TOConline → AT) — Design` - 16 edges
7. `compilerOptions` - 16 edges
8. `Cliconta Design System + Reformulação do Front-end — Implementation Plan` - 16 edges
9. `startAtFixtureServer()` - 15 edges
10. `requireRole()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `planCompanyReconciliation()` --indirect_call--> `company()`  [INFERRED]
  packages/core/src/domain/toconline/reconcile.ts → apps/worker/test/toconline/guards.test.ts
- `createUser()` --calls--> `registerUser()`  [EXTRACTED]
  apps/web/src/app/(dashboard)/admin/users/actions.ts → packages/core/src/auth/register.ts
- `ProfileRow` --references--> `AppRole`  [EXTRACTED]
  apps/web/src/app/(dashboard)/admin/users/page.tsx → packages/core/src/auth/roles.ts
- `AdminUsersPage()` --calls--> `dbRoleToUiLabel()`  [EXTRACTED]
  apps/web/src/app/(dashboard)/admin/users/page.tsx → packages/core/src/auth/roles.ts
- `changePassword()` --calls--> `validateNewPassword()`  [EXTRACTED]
  apps/web/src/app/change-password/actions.ts → packages/core/src/auth/validate.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Next.js scaffold default assets** — apps_web_public_file_icon, apps_web_public_globe_icon, apps_web_public_next_logo, apps_web_public_vercel_logo, apps_web_public_window_icon [INFERRED 0.85]

## Communities (155 total, 43 thin omitted)

### Community 0 - "Observability Tracer/Logger"
Cohesion: 0.06
Nodes (37): CompanyFormState, CompanyRepo, CompanyServiceOutput, createCompany(), nn(), normalizeCompany(), updateCompany(), CompanyField (+29 more)

### Community 1 - "Architecture & Domain Overview"
Cohesion: 0.07
Nodes (25): Acesso a dados, Auth / autorização, Banco de dados, Bootstrap do admin, Documentos e Storage (Módulo 1), Domínio (esqueleto, enums extensíveis), Fluxo de migrations, Multi-tenant (equipe = gabinete) (+17 more)

### Community 2 - "DB Schema (Drizzle)"
Cohesion: 0.31
Nodes (7): ClassifiedFailure, classifyFailure(), estruturalPorEtapa(), outcomeDe(), outcomeDoLogin(), transitorioPorEtapa(), CLASSES

### Community 3 - "Observability Stores & DB Client"
Cohesion: 0.11
Nodes (26): AtFixtureMode, AtFixtureState, DECLARACOES, FORMULARIO_LOGIN(), html(), lerCookies(), lerCorpo(), ouvir() (+18 more)

### Community 4 - "Web App Dependencies"
Cohesion: 0.05
Nodes (39): dependencies, class-variance-authority, clsx, lucide-react, next, @radix-ui/react-dialog, @radix-ui/react-dropdown-menu, react (+31 more)

### Community 5 - "Database"
Cohesion: 0.12
Nodes (9): ScanRunnerDeps, CompanyScanner, CredentialLookup, CredentialSource, build(), FakeCredentials, FakeScanner, gridOf() (+1 more)

### Community 6 - "Fiscal Domain & RLS"
Cohesion: 0.17
Nodes (7): CompanyDirectory, UpsertReport, chunk(), DbCompanyDirectory, tocMetadata(), FakeDirectory, ReconcilePlan

### Community 7 - "Turborepo & Lint Config"
Cohesion: 0.18
Nodes (9): abrir(), contextos, empresa(), ESCOPO_CC, ESCOPO_EMPRESA, opcoesDeContexto, pedidos, provider() (+1 more)

### Community 8 - "Root Package Scripts"
Cohesion: 0.05
Nodes (42): devDependencies, eslint, @eslint/js, prettier, @toc/config, turbo, typescript, typescript-eslint (+34 more)

### Community 9 - "Web App tsconfig"
Cohesion: 0.09
Nodes (22): dependencies, drizzle-orm, pg, devDependencies, drizzle-kit, eslint, @toc/config, @types/node (+14 more)

### Community 10 - "Core Package Manifest"
Cohesion: 0.08
Nodes (24): dependencies, drizzle-orm, @toc/db, devDependencies, eslint, @supabase/supabase-js, @toc/config, @types/node (+16 more)

### Community 11 - "Worker Package Manifest"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 12 - "Web Auth & Pages"
Cohesion: 0.13
Nodes (25): Ctx, DELETE(), GET(), PATCH(), GET(), POST(), createCompanyAction(), deleteCompanyAction() (+17 more)

### Community 13 - "Shared Base tsconfig"
Cohesion: 0.11
Nodes (13): AtAuthError, AtAuthReason, AtIntegrityError, AtIntegrityOutcome, AtTransientError, AtTransientOutcome, InvalidCredentialsError, StructuralError (+5 more)

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
Cohesion: 0.13
Nodes (21): isPersistable(), normalizeScan(), persistableCompanies(), toCleanString(), toPositiveInt(), diff(), emptySummary(), planCompanyReconciliation() (+13 more)

### Community 20 - "Package tsconfig (worker)"
Cohesion: 0.29
Nodes (6): Banco, Convenções, Código, Fluxo de trabalho (Git), Observabilidade, TDD

### Community 21 - "Web Root Layout"
Cohesion: 0.40
Nodes (3): display, metadata, sans

### Community 25 - "Web Home Page"
Cohesion: 0.07
Nodes (27): CLAUDE.md — Automação de Guias Fiscais (TOConline), Comandos essenciais, Convenções técnicas, Estrutura, graphify, Mapa da documentação, Regras de trabalho, 10. Glossário (+19 more)

### Community 26 - "Worker Entrypoint"
Cohesion: 0.07
Nodes (17): AtCompanyHandle, AtPrecondition, AtSessionFactory, AtSessionUrls, AttemptGuard, AuthenticatedAtSession, CredentialScope, DeclarationRead (+9 more)

### Community 35 - "Config Package"
Cohesion: 0.24
Nodes (4): AtIvaDeclarationReader, AT, AtOptions, TOC_DIRECT_ACCESS

### Community 36 - "IRS Withholding (IRS)"
Cohesion: 0.20
Nodes (9): 1. Instalar e subir o Supabase local, 2. Variáveis de ambiente — dois ficheiros, dois leitores, 3. Aplicar migrations e seed, 4. Subir o dashboard, 5. Subir o worker, Desenvolvimento local, Requisitos, Scripts de reconhecimento (Fase 0 do Módulo 1) (+1 more)

### Community 37 - "Management Dashboard (planned)"
Cohesion: 0.19
Nodes (20): AdminUsersPage(), EquipesPage(), capitalize(), dateFmt, formatDate(), TraceRow, TracesPage(), DataTable() (+12 more)

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
Cohesion: 0.17
Nodes (4): InMemoryStore, SupabaseStore, EventRecord, TraceRecord

### Community 47 - "@toc/worker (scaffold)"
Cohesion: 0.40
Nodes (4): Checklist, Como testar, O que muda, Por quê

### Community 48 - "jobs queue consumed by worker"
Cohesion: 0.15
Nodes (24): abortar(), abrirContexto(), Argumentos, escutar(), escutarPagina(), etapa(), hostDe(), irPara() (+16 more)

### Community 49 - "Worker runs off Vercel (long-running process + real browser)"
Cohesion: 0.14
Nodes (24): Ctx, DELETE(), GET(), PATCH(), GET(), POST(), createTeamAction(), deleteTeamAction() (+16 more)

### Community 50 - "Portal automation (TOConline, AT, Segurança Social, e-Fatura)"
Cohesion: 0.22
Nodes (3): AGORA, job(), payload()

### Community 51 - "@toc/worker RPA worker (scaffold)"
Cohesion: 0.12
Nodes (16): JOB_LABELS, LABELS, StatusBadgeProps, StatusKind, Tone, TONES, BadgeTone, IVA_ROW_TONES (+8 more)

### Community 53 - "tenancy.smoke.test.ts"
Cohesion: 0.25
Nodes (5): criadas, db, makeCompany(), nextNiss(), pool

### Community 54 - "apps/worker (Node + Playwright RPA)"
Cohesion: 0.29
Nodes (3): criadas, db, pool

### Community 55 - "ObligationLedger"
Cohesion: 0.21
Nodes (12): LogsPage(), TraceRow, EventRow, LogRow, renderEventTree(), TraceDetailPage(), TraceRow, signIn() (+4 more)

### Community 57 - "JobQueue"
Cohesion: 0.11
Nodes (9): backoffMs(), JobQueue, JobHandler, JobOutcome, WorkerLoop, WorkerLoopDeps, db, equipasCriadas (+1 more)

### Community 58 - "actions.ts"
Cohesion: 0.26
Nodes (9): changePassword(), createUser(), CreateUserState, VALID_UI_ROLES, CreateUserForm(), ActionMeta, getTracer(), startAction() (+1 more)

### Community 59 - "browser.ts"
Cohesion: 0.21
Nodes (4): BrowserProvider, PlaywrightBrowser, PlaywrightBrowserOptions, installKeepNamesShim()

### Community 60 - "normalize.ts"
Cohesion: 0.29
Nodes (8): NIFS, padroesDeHost(), SENHAS, abrirSessao(), empresa(), provider(), reader(), sessoes

### Community 63 - "session.browser.test.ts"
Cohesion: 0.47
Nodes (5): PAGINA_LOGIN(), provider(), sessions(), startServer(), visitas

### Community 64 - "iva-outcome-effects.ts"
Cohesion: 0.39
Nodes (6): CapturedPdf, capturePdf(), Estrategia, porDownload(), porPopup(), porResposta()

### Community 66 - "document-store.ts"
Cohesion: 0.36
Nodes (4): DocumentStore, classificar(), estado(), SupabaseDocumentStore

### Community 67 - "iva-fakes.ts"
Cohesion: 0.32
Nodes (7): camposDoPortal(), CREDENCIAL_AT, CREDENCIAL_TOCONLINE, documento(), FakeLedgerOptions, FakeSessionsOptions, pdfValido()

### Community 70 - "getSessionUser"
Cohesion: 0.47
Nodes (4): DashboardLayout(), getSessionUser(), SessionUser, WriterScope

### Community 71 - "credential-form.tsx"
Cohesion: 0.47
Nodes (5): CredentialForm(), CredentialFormCopy, CredentialFormProps, formatDate(), invalidReasonLabel()

### Community 80 - "clients (empresas do gabinete)"
Cohesion: 0.08
Nodes (29): ProfileRow, CookieToSet, updateSession(), config, proxy(), ChangePasswordGuardInput, shouldRedirectToChangePassword(), generateTempPassword() (+21 more)

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
Cohesion: 0.06
Nodes (62): ChangePasswordPage(), initialState, CompanyForm(), CompanyFormProps, TeamForm(), TeamFormProps, ScanPanelProps, AppShellProps (+54 more)

### Community 89 - "Design System Cliconta + Reformulação do Front-end — Design"
Cohesion: 0.09
Nodes (21): 10. Acessibilidade, 11. Fora de escopo (YAGNI), 12. Riscos e mitigação, 1. Objetivo, 2. Contexto e restrições, 3. Referência visual (DNA da Cliconta), 4.1 Cores, 4.2 Tipografia (Hanken Grotesk; display peso 500) (+13 more)

### Community 90 - "components.json"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 91 - "Cliconta Design System + Reformulação do Front-end — Implementation Plan"
Cohesion: 0.12
Nodes (16): Cliconta Design System + Reformulação do Front-end — Implementation Plan, File Structure, Global Constraints, Self-Review (cobertura da spec), Task 10: Equipes (lista + form em Dialog + edição), Task 11: Admin / Usuários, Task 12: Verificação final, Task 1: Fundação — Tailwind v4, tokens, fontes, `cn` (+8 more)

### Community 95 - "normalize.ts"
Cohesion: 0.30
Nodes (9): digitsOnly(), documentFieldsComplete(), DocumentFieldWarning, NormalizedDocumentFields, normalizeDocumentFields(), parseAmount(), presentText(), RawDocumentFields (+1 more)

### Community 100 - "sidebar.tsx"
Cohesion: 0.36
Nodes (5): FetchAllState, fetchIvaDocumentAction(), FetchState, FetchButton(), FetchButtonProps

### Community 113 - "service.ts"
Cohesion: 0.14
Nodes (17): CredentialRepo, CredentialServiceOutput, saveCredential(), SecretCipher, validateBase(), CREDENTIAL_STATUS_LABELS, CREDENTIAL_STATUSES, CredentialInput (+9 more)

### Community 114 - "package.json"
Cohesion: 0.08
Nodes (23): dependencies, drizzle-orm, playwright, @supabase/supabase-js, @toc/core, @toc/db, devDependencies, eslint (+15 more)

### Community 115 - "session.ts"
Cohesion: 0.06
Nodes (46): AccessCredentialSelection, CredentialCandidate, evaluate(), rejected(), selectAccessCredential(), fieldOf(), formatDatePt(), INVALID_REASON_LABELS (+38 more)

### Community 119 - "cn"
Cohesion: 0.33
Nodes (6): admin, apagarCredencialAt(), criarCredencialAt(), criarJobObtido(), limparFila(), rest()

### Community 121 - "session.browser.test.ts"
Cohesion: 0.11
Nodes (31): addDays(), derivePaymentDueDate(), DueDateOptions, DueDates, easterSunday(), endMonthOf(), FIXED_HOLIDAYS, isoDate() (+23 more)

### Community 122 - "Task 2 Report: Buckets de Storage (`guias` e `rpa-diagnostics`)"
Cohesion: 0.07
Nodes (31): createDb(), schema, profiles, companies, documents, integrationCredentials, obligationPeriods, obligations (+23 more)

### Community 123 - "types.ts"
Cohesion: 0.06
Nodes (19): DbCredentialSource, motivoDaMarca(), daEquipa(), DbObligationLedger, semRegressao(), db, equipasCriadas, ficheirosCriados (+11 more)

### Community 124 - "enums.ts"
Cohesion: 0.25
Nodes (11): decryptSecret(), encryptSecret(), generateEncryptionKey(), isEncryptedSecret(), MESSAGES, ParsedToken, parseToken(), resolveKey() (+3 more)

### Community 126 - "getSupabaseAdminClient"
Cohesion: 0.60
Nodes (4): abortar(), lerChave(), main(), USO

### Community 127 - "supabase-store.test.ts"
Cohesion: 0.08
Nodes (30): deleteTocCredentialAction(), saveTocCredentialAction(), ScanFormState, startCompanyScanAction(), PageProps, RESULT_LABELS, TocOnlinePage(), ScanPanel() (+22 more)

### Community 128 - "tsconfig.test.json"
Cohesion: 0.33
Nodes (5): compilerOptions, noEmit, rootDir, extends, include

### Community 129 - "page.tsx"
Cohesion: 0.05
Nodes (78): FetchAllButton(), FetchAllButtonProps, GuiasIvaPage(), PageProps, buildBulkRows(), BulkCompany, BulkCounts, BulkPlan (+70 more)

### Community 132 - "index.ts"
Cohesion: 0.20
Nodes (11): getWebTracer(), createTracer(), Tracer, ErrorInput, EventStatus, LogLevel, StartTraceInput, TraceStatus (+3 more)

### Community 133 - "task-1-brief.md"
Cohesion: 0.17
Nodes (5): createdStorageObjectIds, createdTeamIds, createdUserIds, db, pool

### Community 136 - "build"
Cohesion: 0.20
Nodes (4): BuildOptions, FakeAttempts, FakeDocuments, FakeStorage

### Community 137 - "ObligationLedger"
Cohesion: 0.33
Nodes (8): cellAt(), COLUMN_KEYWORDS, DeclarationRow, findColumn(), parseDeclarationRows(), pickMostRecentDeclaration(), plain(), submissionRank()

### Community 139 - "tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, outDir, rootDir, extends, include

### Community 141 - "AtCredentialSource"
Cohesion: 0.27
Nodes (11): allFields(), AtPageKind, AtPageSnapshot, classifyAtPage(), fingerprint(), hasNifField(), hasPasswordField(), hostOf() (+3 more)

### Community 142 - "PortalGate"
Cohesion: 0.19
Nodes (8): CompanyScanRunner, parsePayload(), ScanOutcome, ScanPayload, ClaimedJob, observability, TraceHandle, EventInput

### Community 143 - "ports.ts"
Cohesion: 0.13
Nodes (7): FileStorageStateStore, InMemoryStorageStateStore, safeName(), SavedSession, StorageState, StorageStateStore, dirs

### Community 144 - "ObservabilityStore"
Cohesion: 0.25
Nodes (3): ObservabilityStore, createEvent(), EventHandle

### Community 146 - "AtSessionFactory"
Cohesion: 0.17
Nodes (6): AcessoGovAtSessions, caminhosDe(), CaminhosDoPortal, FAMILIA_DE_LOGIN, seguirODocumento(), SessaoAberta

### Community 147 - "validate.ts"
Cohesion: 0.17
Nodes (10): assertDocumentBelongsTo(), assertPdfIntegrity(), assertPeriodMatches(), ContextoDoJob, IvaDocumentRunner, IvaRunnerDeps, IvaRunnerPolicy, desfechoDoJob (+2 more)

### Community 148 - "FakeCredentials"
Cohesion: 0.20
Nodes (7): LogRecord, fakeClient(), loggedAt, makeStore(), occurredAt, RecordedCall, startedAt

### Community 149 - "types.ts"
Cohesion: 0.24
Nodes (10): loadEnv(), MissingEnvError, parseAtAccessMode(), parsePositiveInt(), REQUIRED, WorkerEnv, criarSessoesAt(), log() (+2 more)

### Community 150 - "CompanyScanner"
Cohesion: 0.18
Nodes (3): ContextoFalso, Emissor, PaginaFalsa

### Community 151 - "Logger"
Cohesion: 0.18
Nodes (11): AuthenticatedTocSession, sleep(), countItems(), GridRead, GridReadOptions, readCompaniesGrid(), GridProjection, GridSource (+3 more)

### Community 154 - "page.tsx"
Cohesion: 0.47
Nodes (3): deleteAtCredentialAction(), saveAtCredentialAction(), PageProps

### Community 155 - "enums.ts"
Cohesion: 0.60
Nodes (3): firstGroup(), parseFieldsFromText(), PATTERNS

### Community 156 - "company-directory.ts"
Cohesion: 0.16
Nodes (9): OpenedSession, TocOnlineCredentials, TocSessionFactory, TOCONLINE, assertTocHost(), PlaywrightTocSessions, REJECTION_NOTICE, TocOnlineOptions (+1 more)

### Community 164 - "payment-document.browser.test.ts"
Cohesion: 0.28
Nodes (5): abrirSessao(), empresa(), provider(), providersReais, sessoes

### Community 171 - "service.test.ts"
Cohesion: 0.40
Nodes (3): FakeAdmin, invalidRow, Row

## Knowledge Gaps
- **658 isolated node(s):** `admin`, `PageProps`, `RESULT_LABELS`, `PageProps`, `PageProps` (+653 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **43 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AppShell()` connect `Web App Dependencies` to `cn`, `getSessionUser`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **What connects `admin`, `PageProps`, `RESULT_LABELS` to the rest of the system?**
  _661 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Observability Tracer/Logger` be split into smaller, more focused modules?**
  _Cohesion score 0.06240084611316764 - nodes in this community are weakly interconnected._
- **Should `Architecture & Domain Overview` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._
- **Should `Observability Stores & DB Client` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._
- **Should `Web App Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Database` be split into smaller, more focused modules?**
  _Cohesion score 0.12121212121212122 - nodes in this community are weakly interconnected._