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

- `jobs` — fila DB-backed. `status`: `pending | running | succeeded | failed | skipped | cancelled`.

### Multi-tenant (equipe = gabinete)

- `teams` — o gabinete de contabilidade (tenant). `status` (`team_status`: `active | inactive`),
  `nif` do próprio gabinete. Tem vários usuários (`profiles.team_id`) e várias empresas.
- `profiles.team_id` — FK nullable → `teams` (`on delete set null`). **NULL = admin global**
  (enxerga todas as equipes). Um usuário pertence a **uma** equipe.

### Domínio (esqueleto, enums extensíveis)

- `companies` — **empresa cliente** (contribuinte). Substituiu a antiga `clients`. Chave de
  Segurança Social `niss` (`bigint`, **UNIQUE global**); `nif` (cruzamento AT/TOConline),
  `type` (`contributor_type`: `employer | self_employed | voluntary_social_insurance |
  domestic_service`), `status` (`company_status`: `active | inactive | suspended`), contato e
  morada (PT). Pertence a uma equipe via `team_id` (`on delete cascade`).
- `obligations` — obrigação recorrente por empresa (`company_id`, `kind`, `frequency`).
- `obligation_periods` — estado por **empresa × obrigação × período** (unique `(obligation_id, period)`
  → idempotência). `status`: `pending | in_progress | delivered | paid | skipped_nonexistent | error | not_applicable`.
- `documents` — as guias (entidade, referência, valor, `valid_until` só p/ SS, `storage_path`).
- `integration_credentials` — acesso por empresa/provider (`company_id`); `secret_encrypted`
  (criptografia planejada, ainda não implementada — alvo: Supabase Vault / pgsodium).
  `status`/`expires_at` modelam "senha da SS expira".

## RLS

Ligado em todas as tabelas de aplicação. Leitura para autenticados; escrita via service role
(worker/cliente admin do dashboard) que bypassa RLS, com checagem de papel/equipe na app.
`integration_credentials` só é lida por `admin`. A função `public.current_app_role()` resolve o
papel do usuário atual.

**Escopo por equipe (multi-tenant):** `public.current_app_team()` resolve a `team_id` do usuário
atual. `teams` (`read_own_team`) e `companies` (`read_team_companies`) só são lidas quando
`team_id = current_app_team()` **ou** o papel é `admin` (global). O trigger
`prevent_privileged_self_update` também impede o usuário de trocar a **própria** `team_id`
(além de `role`/`must_change_password`). `obligations`/`documents` mantêm leitura ampla para
autenticados por ora (dívida: escopar por `company_id`).

`profiles` tem leitura restrita: cada usuário lê **o próprio** (`read_own_profile`) e o admin
lê **todos** (`admin_read_all_profiles`) — email/role não vazam entre usuários comuns.

O trigger `prevent_privileged_self_update` bloqueia o usuário de alterar o **próprio** `role`
ou `must_change_password` num self-update (a policy `update_own_profile` permite editar a
própria linha). Sob service role o `auth.uid()` é `NULL`, então admin/worker não é bloqueado.

## Bootstrap do admin

Só admin cadastra usuários, então o **primeiro** admin nasce fora do fluxo:

- **Local/dev/e2e:** `supabase/seed.sql` cria `admin@local.test` / `admin123` (role `admin`,
  `must_change_password = false`), aplicado no `pnpm db:reset`.
- **Produção:** crie o usuário manualmente (Supabase Studio → Authentication → Add user) e
  promova via SQL: `update public.profiles set role='admin', must_change_password=false where email='...';`
  (ou um script one-off usando a service role + `auth.admin.createUser`). Desligue o signup
  público também no projeto de produção (Dashboard → Authentication → Providers → Email).

## Acesso a dados

Via `@toc/db`: `createDb(connectionString)` retorna um client Drizzle tipado (driver `pg`).
O schema é exportado como `schema` (`import { schema } from "@toc/db"`).
