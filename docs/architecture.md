# Arquitetura

## Visão geral

Monorepo com **dois deployables** e **um Supabase** como fonte da verdade.

```
┌─────────────────┐     ┌──────────────────┐
│  apps/web        │     │  apps/worker      │
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
- `GET /api/documents/[id]/download` (Módulo 1) — não devolve JSON: confirma com o cliente RLS
  que a linha `documents` pedida é visível ao utilizador, assina uma signed URL de 60 s no
  bucket privado e responde **302** com `Location` para ela (a URL nunca entra no corpo nem no
  DOM). 401 sem sessão; 404 para id inexistente **ou** de outra equipe — nunca 403, que
  revelaria que a guia existe.

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

## Storage

O bucket `documents` (privado, só PDF, 10 MiB) guarda as guias em
`<team>/<company>/iva/<period>.pdf`. Quem **escreve** é sempre o worker, com a service role
(bypassa RLS, como as outras escritas de RPA); quem **lê** é sempre a rota
`GET /api/documents/[id]/download` do `apps/web` — nunca o browser diretamente contra o
Storage. `storage.objects` não tem policy para `authenticated`: a autorização vive na linha
`documents` (RLS por equipe), e a rota só assina a URL depois de confirmar essa visibilidade
com o cliente RLS. Ver `docs/database.md` §§ "Documentos e Storage" / "View
`iva_documents_overview`".

## Módulo 1 — guia de pagamento do IVA

Fluxo: o dashboard enfileira a busca **por empresa** (botão "Buscar") ou **em lote** por equipe
("Buscar todas", um job por empresa) → job `rpa.fetch_iva_document` entra na fila `jobs` →
`IvaDocumentRunner` (worker) abre sessão no Portal das Finanças → lê a declaração de IVA mais
recente → obtém o documento de pagamento (PDF + entidade/referência/valor) → grava o PDF no
Storage → regista `obligations → obligation_periods → documents` → a listagem
(`/documentos/iva`, view `iva_documents_overview`) mostra o resultado de cada tentativa, com
orientação do que fazer a seguir.

A rota de acesso ao Portal das Finanças é uma **porta trocável**: `AtSessionFactory`
(`apps/worker/src/runner/ports.ts`), selecionada pela env `AT_ACCESS_MODE` — a mesma variável
lida pelo web (`apps/web/src/lib/documents/access.ts`) e pelo worker
(`apps/worker/src/config/env.ts`), porque é o dashboard que escolhe a credencial e escreve o
`access` no `jobs.payload` que o worker depois executa. Valores: `at_direct_login` (omissão —
login do gabinete no `acesso.gov.pt`, implementado) e `toconline_direct_access` (Acesso Direto
por dentro do TOConline, a decidir na Fase 0 de reconhecimento). O runner não sabe qual rota
está ligada: só confirma que a credencial resolvida é a que o adaptador declara consumir
(`credentialProvider`).

## Deploy

- `apps/web` → Vercel (Next.js App Router). Variáveis de ambiente via `vercel env`.
- `apps/worker` → ambiente com processo de longa duração (Fly.io / Railway / container).
- Banco → Supabase (produção) / Supabase CLI local (desenvolvimento).
