# Automação de Guias Fiscais (TOConline)

Sistema de automação (RPA) + orquestração + dashboard para o ciclo mensal de guias
fiscais de um gabinete de contabilidade português. Ver o contexto de domínio em
[`docs/context/project-context.md`](docs/context/project-context.md).

## Stack

pnpm + Turborepo · TypeScript · Next.js (App Router) → Vercel · Node + Playwright (worker) ·
Supabase (Postgres + Auth + Storage) · Drizzle ORM · Vitest + Playwright.

## Requisitos

- Node 24 (`.nvmrc`)
- pnpm 11
- Docker (para o Supabase local)
- [Supabase CLI](https://supabase.com/docs/guides/cli)

## Setup rápido

```bash
pnpm install
pnpm db:start                 # Supabase local (Docker)
cp .env.example .env          # preencher com o output de `supabase status`
pnpm db:reset                 # aplica migrations + seed
pnpm dev                      # sobe o dashboard (apps/web)
```

## Comandos

```bash
pnpm test        # todos os testes (Vitest + Playwright)
pnpm lint        # ESLint
pnpm typecheck   # TypeScript
pnpm db:generate # gera SQL de migration a partir do schema Drizzle
```

Mais detalhes em [`docs/local-development.md`](docs/local-development.md) e
[`CLAUDE.md`](CLAUDE.md).

## Estrutura

```
apps/web       Dashboard + API + Auth (Next.js → Vercel)
apps/worker    Worker de RPA (Node + Playwright) — scaffold
packages/db    Schema Drizzle + client (Postgres)
packages/core  Observabilidade (Tracer/Logger) + tipos de domínio
packages/config Config compartilhada (tsconfig, eslint)
supabase/      Stack local + migrations
docs/          Documentação
```
