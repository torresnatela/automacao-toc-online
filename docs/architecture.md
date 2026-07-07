# Arquitetura

## Visão geral

Monorepo com **dois deployables** e **um Supabase** como fonte da verdade.

```
┌─────────────────┐     ┌──────────────────┐
│  apps/web        │     │  apps/worker      │  (scaffold nesta fase)
│  Next.js (App    │     │  Node + Playwright│
│  Router)         │     │  RPA + fila       │
│  Dashboard+API+  │     │                   │
│  Auth → Vercel   │     │  → Fly/Railway/VPS│
└────────┬─────────┘     └─────────┬────────┘
         │        packages/*        │
         │  db · core (tracer/log)  │
         └──────────┬───────────────┘
                    ▼
            ┌───────────────┐
            │   Supabase    │  Postgres (verdade) + Auth + Storage (PDFs)
            └───────────────┘
```

## Por que dois deployables

A automação de browser (Playwright) exige processo persistente, sessões longas, 2FA e
download de PDFs — incompatível com o modelo serverless/stateless da Vercel (limite de
tempo, sem browser vivo entre passos). O dashboard/API/auth, ao contrário, é ideal para a
Vercel. Ambos compartilham código via `packages/*` e falam com o mesmo Supabase.

## Fronteiras dos pacotes

- `packages/core` — não depende de Next nem de detalhes do worker; só de `@toc/db` e tipos.
  Contém a biblioteca de observabilidade (Tracer/Logger) e tipos de domínio. Testável isolada.
- `packages/db` — encapsula schema e client (driver `pg`). Consumidores não escrevem SQL solto.
- `apps/*` — consomem `packages/*`, nunca o contrário.
- `packages/config` — tsconfig base e preset de ESLint compartilhados.

## Fila de trabalho

A tabela `jobs` no Postgres é a fila. O worker consumirá com `SELECT … FOR UPDATE SKIP
LOCKED`. Simples e suficiente para a cadência de RPA; trocável por fila dedicada depois.

## Deploy

- `apps/web` → Vercel (Next.js App Router). Variáveis de ambiente via `vercel env`.
- `apps/worker` → ambiente com processo de longa duração (Fly.io / Railway / container).
- Banco → Supabase (produção) / Supabase CLI local (desenvolvimento).
