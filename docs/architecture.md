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

## Superfície de API (apps/web)

O `apps/web` expõe uma **API REST** em `src/app/api/*` (route handlers Node) além das páginas
(Server Components) e Server Actions:

- `GET/POST /api/companies`, `GET/PATCH/DELETE /api/companies/[id]`
- `GET/POST /api/teams`, `GET/PATCH/DELETE /api/teams/[id]`

Convenção de resposta: `{ ok: true, data }` / `{ ok: false, error, fieldErrors? }` com status
`200/201/400/401/403/404`. A **regra de negócio é compartilhada**: validação/normalização
pura em `@toc/core/domain` (portas `CompanyRepo`/`TeamRepo`, injeção de dependência), e um
service em `apps/web/src/lib/{companies,teams}/service.ts` que a API e as Server Actions da UI
consomem em comum. Leituras usam o cliente Supabase com RLS (escopo por equipe); escritas usam
a service role após checagem de papel/equipe, sempre abrindo um `trace` (`@toc/core`). O
middleware deixa `/api/*` passar (o handler responde 401/403 JSON em vez de redirecionar).

## Fronteiras dos pacotes

- `packages/core` — não depende de Next nem de detalhes do worker; só de `@toc/db` e tipos.
  Contém a biblioteca de observabilidade (Tracer/Logger) e tipos + regras de domínio
  (`@toc/core/domain`: empresas/equipes). Testável isolada.
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
