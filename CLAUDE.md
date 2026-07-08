# CLAUDE.md — Automação de Guias Fiscais (TOConline)

Monorepo pnpm + Turborepo. Sistema de automação (RPA) + orquestração + dashboard para o
ciclo mensal de guias fiscais de um gabinete de contabilidade português.

## Estrutura

- `apps/web` — Next.js (App Router) → dashboard + rotas de API + auth. Deploy na **Vercel**.
- `apps/worker` — worker de RPA (Node + Playwright). **Scaffold** (implementado por feature). Roda fora da Vercel.
- `packages/db` — schema Drizzle (fonte da verdade), client tipado (driver `pg`), migrations.
- `packages/core` — tipos de domínio + biblioteca de observabilidade (Tracer/Logger).
- `packages/config` — tsconfig base + preset de ESLint compartilhados.
- `supabase/` — `config.toml`, `migrations/`, `seed.sql` (stack local via Supabase CLI/Docker).

Supabase = Postgres (fonte da verdade) + Auth + Storage (PDFs). Ambos os apps falam com o mesmo Supabase.

## Comandos essenciais

- `pnpm install` — instala tudo.
- `pnpm db:start` / `pnpm db:stop` — sobe/derruba o Supabase local (Docker).
- `pnpm db:reset` — recria o BD e aplica migrations + seed (**à parte** do dev server).
- `pnpm db:generate` — drizzle-kit gera o SQL da migration a partir do schema TS.
- `pnpm db:migrate` — aplica migrations pendentes.
- `pnpm dev` — sobe os apps em desenvolvimento.
- `pnpm test` / `pnpm lint` / `pnpm typecheck` — via Turborepo (todos os pacotes).

> **Portas locais deslocadas (+100):** este projeto usa API 54421, DB 54422, Studio 54423
> para coexistir com outro stack Supabase na mesma máquina. Confirme com `supabase status`.

## Regras de trabalho

- **TDD sempre**: red → green → refactor. Vitest para unit/integração; Playwright para e2e.
- **Feature branches**: crie uma branch a partir de `main` → PR → review da equipe → merge.
- **Schema**: fonte da verdade em `packages/db/src/schema/*`. Gere migrations com `pnpm db:generate`;
  edite SQL à mão **apenas** para RLS/policies/triggers (arquivos `*_rls.sql`).
- **Observabilidade**: todo fluxo com efeito colateral cria um `trace` e encadeia `events`/`logs`
  via `@toc/core` (`createTracer` + `DbStore`). Ver `docs/event-logging.md`.
- **RLS ligado** em todas as tabelas: o worker usa a service role (bypass); o dashboard respeita `profiles.role`.
- **Segredos**: só em `.env` (nunca commitado). Há `.env.example` como referência.
- **Testes de DB** exigem o Supabase local; no CI são pulados com `SKIP_DB_TESTS=1`.

## Convenções técnicas

- TypeScript strict em todo o repo. Imports relativos **sem extensão** dentro dos pacotes.
- Driver de banco: `pg` (node-postgres) — o `postgres-js` não roda sob o Vitest neste setup.
- Conventional Commits.

## Mapa da documentação

- `docs/context/project-context.md` — contexto de domínio (o problema).
- `docs/architecture.md` — arquitetura e fronteiras.
- `docs/event-logging.md` — modelo de traces/events/logs e a API do `@toc/core`.
- `docs/database.md` — schema, migrations e fluxo Drizzle→Supabase.
- `docs/local-development.md` — setup local passo a passo.
- `docs/conventions.md` — convenções de código, commits e branches.
- `docs/superpowers/specs/` e `docs/superpowers/plans/` — specs e planos de implementação.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
