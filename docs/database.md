# Banco de dados

Postgres (Supabase). Schema em Drizzle é a **fonte da verdade**
(`packages/db/src/schema/*`). Migrations SQL são geradas por `drizzle-kit` e versionadas
em `supabase/migrations/`. RLS/policies/triggers são escritos à mão em arquivos `*_rls.sql`.

## Fluxo de migrations

```bash
# 1. edite o schema em packages/db/src/schema/*
# 2. gere o SQL da migration
pnpm db:generate
# 3. (se necessário) crie um arquivo *_rls.sql com RLS/policies/triggers
# 4. aplique tudo, recriando o banco local
pnpm db:reset
```

`pnpm db:*` roda **à parte** do `pnpm dev` — nunca acople migrations ao boot do app.

## Tabelas (base)

### Auth / autorização

- `profiles` — espelha `auth.users` (via trigger `handle_new_user`). Guarda `role`
  (`app_role`: `admin | operator | viewer`) e `must_change_password`. A UI de cadastro
  expõe só **Admin** e **Member** (Member = `viewer`; `operator` fica reservado). Cadastro
  é feito por admin via `auth.admin.createUser` (service role); o signup público está
  **desligado** (`enable_signup = false`).
  - **Gate do 1º acesso:** o middleware/login leem `app_metadata.must_change_password` do
    **JWT** (o `getUser()` já roda — sem query extra). A coluna `profiles.must_change_password`
    espelha o mesmo estado para exibição no `/admin/users`. `createUser` seta ambos como
    `true`; `change-password` limpa ambos via service role.

### Observabilidade

- `traces`, `events`, `logs` — ver [`event-logging.md`](event-logging.md).

### Orquestração

- `jobs` — fila DB-backed. `status`: `pending | running | succeeded | failed | skipped | cancelled`
  (`deferred` não é valor do enum: o gate do Módulo 1 devolve o job à fila como `pending` com
  `last_error.deferred = true`, sem gastar tentativa). `team_id` (dono do job) e `company_id`
  (a empresa a que ele diz respeito; `on delete set null` — apagar a empresa não apaga o rasto
  operacional) são nullable: um job de varredura não tem empresa. Índice
  `jobs_company_latest_idx (team_id, type, company_id, created_at desc)` serve o "último job
  deste tipo para esta empresa" que a view `iva_documents_overview` lê por lateral. Unique
  parcial `jobs_company_inflight_uq (company_id, type) where status in ('pending','running')` —
  idempotência por empresa garantida pela BD: um segundo pedido para a mesma empresa recebe
  `23505` em vez de duplicar o trabalho de RPA (NULL fica fora do índice; jobs sem empresa
  coexistem).

### Multi-tenant (equipe = gabinete)

- `teams` — o gabinete de contabilidade (tenant). `status` (`team_status`: `active | inactive`),
  `nif` do próprio gabinete. Tem vários usuários (`profiles.team_id`) e várias empresas.
- `profiles.team_id` — FK nullable → `teams` (`on delete set null`). **NULL = admin global**
  (enxerga todas as equipes). Um usuário pertence a **uma** equipe.

### Domínio (esqueleto, enums extensíveis)

- `companies` — **empresa cliente** (contribuinte). Substituiu a antiga `clients`. Chave de
  Segurança Social `niss` (`bigint`, nullable, único **por equipe** — não global: duas equipes
  podem ter o mesmo contribuinte sem colidir); `nif` (nullable, também único por equipe;
  cruzamento AT/TOConline), `type` (`contributor_type`: `employer | self_employed |
voluntary_social_insurance | domestic_service`), `status` (`company_status`: `active |
inactive | suspended`), contato e morada (PT). Pertence a uma equipe via `team_id`
  (`on delete cascade`).
- `obligations` — obrigação recorrente por empresa (`company_id`, `kind`, `frequency`). Unique
  `obligation_company_kind_uq (company_id, kind)` — uma empresa tem uma obrigação de cada tipo,
  o que torna o upsert do worker exprimível (`on conflict … do update`) em vez de um
  select-then-insert que duplicaria a obrigação sob dois jobs concorrentes.
- `obligation_periods` — estado por **empresa × obrigação × período** (unique `(obligation_id, period)`
  → idempotência). `status`: `pending | in_progress | delivered | paid | skipped_nonexistent | error | not_applicable`.
- `documents` — as guias (entidade, referência, valor, `valid_until`, `storage_path`). Unique
  `document_period_type_uq (obligation_period_id, type)` — um documento de cada tipo por
  período: buscar a guia de novo atualiza a linha existente em vez de acumular.
- `integration_credentials` — credencial de integração por **(equipe, provider)**: `company_id`
  nulo é o nível normal (uma senha do TOConline serve as empresas todas do gabinete);
  `company_id` preenchido fica reservado a credenciais **por empresa** (AT/SS, quando o portal
  exige uma senha por contribuinte). `secret_encrypted` é cifrado pela aplicação com
  **AES-256-GCM** (`@toc/core/crypto`), formato `v1:<iv>:<tag>:<ciphertext>` — implementado,
  não mais planejado. `status`/`expires_at` modelam "a senha expirou/foi recusada pelo portal".

## RLS

Ligado em todas as tabelas de aplicação. Leitura para autenticados; escrita via service role
(worker/cliente admin do dashboard) que bypassa RLS, com checagem de papel/equipe na app.
`integration_credentials` **não tem policy de `select` na tabela base** — nem para `admin`: RLS
é row-level, não column-level, e não há como permitir a linha sem também permitir a coluna do
segredo. A leitura passa pela view `integration_credentials_safe` (sem `secret_encrypted`, só
`has_secret`), que resolve o escopo por equipe/`admin` dentro da própria view (`security_invoker
= false`). A função `public.current_app_role()` resolve o papel do usuário atual.

**Escopo por equipe (multi-tenant):** `public.current_app_team()` resolve a `team_id` do usuário
atual. `teams` (`read_own_team`) e `companies` (`read_team_companies`) só são lidas quando
`team_id = current_app_team()` **ou** o papel é `admin` (global). O trigger
`prevent_privileged_self_update` também impede o usuário de trocar a **própria** `team_id`
(além de `role`/`must_change_password`). `obligations` → `obligation_periods` → `documents`
também são escopadas por equipe desde `20260721224512_tenancy_rls.sql`
(`read_team_obligations`/`read_team_periods`/`read_team_documents`): cada policy sobe a árvore
até `companies.team_id` via `exists`, já que nenhuma das três tabelas guarda `team_id` na
própria linha. `jobs` (`read_team_jobs`) segue a mesma regra desde
`20260816215656_integrations_rls.sql`; `team_id` nulo é job de sistema, visível só a `admin`.

`profiles` tem leitura restrita: cada usuário lê **o próprio** (`read_own_profile`) e o admin
lê **todos** (`admin_read_all_profiles`) — email/role não vazam entre usuários comuns.

O trigger `prevent_privileged_self_update` bloqueia o usuário de alterar o **próprio** `role`
ou `must_change_password` num self-update (a policy `update_own_profile` permite editar a
própria linha). Sob service role o `auth.uid()` é `NULL`, então admin/worker não é bloqueado.

## Documentos e Storage (Módulo 1)

Guias em PDF vivem no bucket **`documents`** do Supabase Storage: privado, 10 MiB, só
`application/pdf`. Nasce **só** da migration `20260904015903_iva_documents_rls.sql`
(`insert into storage.buckets … on conflict do update`) — o `supabase/config.toml` documenta a
decisão em comentário mas não cria o bucket, porque o `config.toml` não corre em produção.
Caminho determinístico e sem PII: `<team_id>/<company_id>/iva/<period>.pdf` (a equipe primeiro
permite uma policy futura por pasta; repetir o upload do mesmo período faz upsert, não
acumula).

`storage.objects` **não tem policy de leitura para `authenticated`** — de propósito, não
esquecimento: a regra de "esta guia é de que equipe" já está escrita em `read_team_documents`
(a RLS de `documents`, acima), e reescrevê-la em cima do nome do ficheiro duplicaria essa regra
num sítio que ninguém lembraria de manter atualizado. O único acesso ao PDF é uma **signed URL
de 60 segundos**, mintada pelo servidor em `GET /api/documents/[id]/download` — só depois de a
rota confirmar, com o cliente **RLS**, que a linha `documents` é visível ao utilizador. A
listagem só sabe que o ficheiro existe pela coluna `has_file` da view abaixo; o `storage_path`
nunca sai da view nem da rota para o browser.

Ordem de escrita do worker (`apps/worker/src/sinks/obligation-ledger.ts` +
`document-store.ts`): o período vai a `in_progress` **antes** do upload; só depois de o upload
ter sucesso é que `documents` é inserido/atualizado e o período passa a `delivered`, os dois
últimos passos na **mesma transação**. Um upload que falha nunca deixa uma linha `documents` a
apontar para um ficheiro que não existe no bucket.

## View `iva_documents_overview`

Uma linha por empresa (left joins com laterais para "o período mais recente" e "o último job"),
com `security_invoker = true` — ao contrário de `integration_credentials_safe`, esta view
**não** faz bypass de RLS: quem lê fica sujeito às policies de `companies`/`obligations`/
`obligation_periods`/`documents`/`jobs`, o mesmo escopo por equipe já escrito nelas. Expõe
`has_file` (`storage_path is not null`) e nunca o `storage_path`.

Os literais `'iva'`, `'iva_payment'` e `'rpa.fetch_iva_document'` na definição da view espelham
`IVA_OBLIGATION_KIND`/`IVA_DOCUMENT_TYPE`/`IVA_DOCUMENT_JOB_TYPE` de `@toc/core/domain` — mudá-
los lá exige uma migration aqui. O smoke test `packages/db/test/iva-documents.smoke.test.ts`
insere um job com a constante importada e prova que a view o devolve, para a divergência
falhar num teste em vez de numa listagem vazia em produção.

## Bootstrap do admin

Só admin cadastra usuários, então o **primeiro** admin nasce fora do fluxo:

- **Local/dev/e2e:** `supabase/seed.sql` cria `admin@local.test` / `admin123` (role `admin`,
  `must_change_password = false`), aplicado no `pnpm db:reset`.
- **Produção:** crie o usuário manualmente (Supabase Studio → Authentication → Add user) e
  promova via SQL: `update public.profiles set role='admin', must_change_password=false where email='...';`
  (ou um script one-off usando a service role + `auth.admin.createUser`). Desligue o signup
  público também no projeto de produção (Dashboard → Authentication → Providers → Email).

## Seed local (Módulo 1)

`supabase/seed.sql` também povoa os estados que a listagem de guias de IVA precisa de desenhar
sem correr uma automação real — só no `pnpm db:reset` (`supabase migration up`, em produção,
**não** executa `seed.sql`; nunca aplique estes dados em produção):

- **operator** (`operator@local.test` / `operator123`, role `operator`, `team_id` = Gabinete
  Demo) — o admin bootstrap é global (sem equipe) e não serve para testar o escopo por tenant.
- três empresas na equipe demo: uma **ligada** ao TOConline com guia de IVA já extraída e
  ficheiro no bucket; uma **sem ligação** (o botão "Buscar" tem de ficar desativado); e uma com
  a guia extraída (entidade/referência/valor) mas **sem ficheiro** (`storage_path` nulo) — o
  caso que separa "existe linha de documento" de "existe PDF no Storage".
- **"Gabinete Outro"** — equipe vizinha com a sua própria guia, para provar o isolamento por
  tenant (o operador da equipe demo não a vê).
- **"Gabinete Vazio"** — equipe sem empresas, para o estado vazio da listagem.

## Acesso a dados

Via `@toc/db`: `createDb(connectionString)` retorna um client Drizzle tipado (driver `pg`).
O schema é exportado como `schema` (`import { schema } from "@toc/db"`).
