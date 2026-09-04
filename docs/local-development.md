# Desenvolvimento local

Passo a passo para subir o stack completo (dashboard + worker + Supabase local) numa máquina
nova. Ver também [`CLAUDE.md`](../CLAUDE.md) (regras de trabalho) e
[`docs/database.md`](database.md) (schema e migrations).

## Requisitos

- Node 24 (`.nvmrc`)
- pnpm 11
- Docker (para o Supabase local)
- [Supabase CLI](https://supabase.com/docs/guides/cli)

## 1. Instalar e subir o Supabase local

```bash
pnpm install
pnpm db:start   # supabase start — sobe Postgres/Auth/Storage/Studio em Docker
```

> **Portas deslocadas (+100):** este projeto usa API `54421`, DB `54422`, Studio `54423` para
> coexistir com outro stack Supabase na mesma máquina. Confirme sempre com `supabase status` —
> não assuma as portas por omissão do Supabase CLI (`54321`/`54322`/`54323`).

## 2. Variáveis de ambiente — dois ficheiros, dois leitores

Há **dois** ficheiros `.env`, porque há dois processos com necessidades diferentes:

- **`.env`** (raiz do repo) — lido manualmente pelo worker (`set -a && . ./.env && set +a`,
  nunca sozinho por `pnpm`/`tsx`) e pelos scripts de reconhecimento. Leva as credenciais do
  Postgres/Supabase **e** as variáveis do RPA (`RPA_*`, `AT_*`).
- **`apps/web/.env.local`** — é o que o **Next.js lê sozinho** (convenção `.env.local` dele).
  Leva só o que o dashboard precisa: as chaves públicas/serviço do Supabase, `DATABASE_URL` e
  `CREDENTIALS_ENC_KEY`. As variáveis `RPA_*`/`AT_*` não têm efeito aqui — o web só lê
  `AT_ACCESS_MODE` (a mesma variável, para escolher a rota junto com o worker).

Gere as duas a partir do Supabase local em vez de copiar valores à mão:

```bash
supabase status -o env --override-name api.url=NEXT_PUBLIC_SUPABASE_URL \
                        --override-name auth.anon_key=NEXT_PUBLIC_SUPABASE_ANON_KEY \
                        --override-name auth.service_role_key=SUPABASE_SERVICE_ROLE_KEY \
                        --override-name db.url=DATABASE_URL
```

Cruze a saída com `.env.example` (comentado, é a referência completa) para montar `.env` e
`apps/web/.env.local`. Depois gere a chave de cifra das credenciais de integração e cole-a nos
dois ficheiros — **tem de ser o mesmo valor** nos dois lados, ou o worker não decifra o que o
dashboard cifrou:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# → CREDENTIALS_ENC_KEY=<resultado>
```

Nunca commite `.env`, `.env.local` nem qualquer `.env.*` (ver `.gitignore`); `.env.example` é a
referência versionada.

## 3. Aplicar migrations e seed

```bash
pnpm db:reset   # supabase db reset — recria o BD, aplica migrations e supabase/seed.sql
```

`pnpm db:reset` roda **à parte** do `pnpm dev` — nunca acople migrations ao boot do app. O seed
cria, entre outros: o admin (`admin@local.test` / `admin123`) e um operador de uma equipe demo
(`operator@local.test` / `operator123`) com empresas e guias de IVA sintéticas para exercitar a
listagem do Módulo 1 sem correr uma automação real (ver `docs/database.md` § "Seed local").
**Nunca aplique este seed em produção** (`supabase migration up`, em produção, não o executa).

## 4. Subir o dashboard

```bash
pnpm --filter web dev
```

Lê `apps/web/.env.local` automaticamente (convenção do Next.js). Acessível em
`http://localhost:3000`.

## 5. Subir o worker

O worker **não** lê `.env` sozinho — o preâmbulo abaixo é sempre necessário, e sempre a partir
da raiz do repo:

```bash
set -a && . ./.env && set +a && pnpm --filter @toc/worker dev
```

O arranque loga uma linha JSON com os tipos de job (`handles`) e `atAccessMode`. `Ctrl+C`
encerra limpo (fecha o Chromium). Detalhes das variáveis do Módulo 1 (`AT_ACCESS_MODE`,
`AT_PACING_MS`, `AT_DAILY_ATTEMPT_CAP`, …) e dos scripts de reconhecimento/sessão assistida em
[`apps/worker/README.md`](../apps/worker/README.md).

## Testes

```bash
pnpm test         # todos os pacotes, via Turborepo
pnpm --filter web test:unit   # só Vitest do dashboard (rápido, sem browser)
pnpm --filter web test:e2e    # só Playwright do dashboard
```

- **Testes de DB** exigem o Supabase local a correr (`pnpm db:start` + `.env` carregado).
  `SKIP_DB_TESTS=1` pula-os — é o que o CI faz quando não sobe o Supabase.
- **Testes de browser** do worker (`*.browser.test.ts`) sobem um Chromium real contra fixtures
  em `localhost`, zero rede externa. `SKIP_BROWSER_TESTS=1` pula-os localmente quando não há
  browser instalado; no CI correm sempre (que instala o Chromium).
- **e2e do dashboard** (`apps/web/e2e`, Playwright) correm **em série** (`workers: 1`,
  `apps/web/playwright.config.ts`) de propósito: vários specs do Módulo 1 partilham a mesma
  credencial `at` da equipa demo e a mesma fila `jobs` contra um único banco de e2e — em
  paralelo, um spec que apaga a credencial na sua montagem tira-a debaixo dos pés de outro que
  acabou de a guardar.

## Scripts de reconhecimento (Fase 0 do Módulo 1)

`apps/worker/scripts/recon-at.ts` (reconhecimento headed do Portal das Finanças) e
`apps/worker/scripts/seed-at-session.ts` (login assistido para gravar uma sessão quando o 2FA
da AT for obrigatório) abrem um browser **visível** e nunca gravam credenciais fora da máquina.
Escrevem em `apps/worker/recon/<data>/`, que é git-ignored — os screenshots contêm dados reais
de contribuintes e nunca devem ir ao repositório. Ver
[`apps/worker/README.md`](../apps/worker/README.md) para os comandos exatos e o formato de
saída.
