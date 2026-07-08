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
  (`app_role`: `admin | operator | viewer`) e `must_change_password` (força a troca de
  senha no 1º acesso). A UI de cadastro expõe só **Admin** e **Member** (Member = `viewer`;
  `operator` fica reservado). Cadastro é feito por admin via `auth.admin.createUser`
  (service role) — o trigger cria o profile com `must_change_password = true`.

### Observabilidade

- `traces`, `events`, `logs` — ver [`event-logging.md`](event-logging.md).

### Orquestração

- `jobs` — fila DB-backed. `status`: `pending | running | succeeded | failed | skipped | cancelled`.

### Domínio (esqueleto, enums extensíveis)

- `clients` — empresas do gabinete.
- `obligations` — obrigação recorrente por cliente (`kind`, `frequency`).
- `obligation_periods` — estado por **cliente × obrigação × período** (unique `(obligation_id, period)`
  → idempotência). `status`: `pending | in_progress | delivered | paid | skipped_nonexistent | error | not_applicable`.
- `documents` — as guias (entidade, referência, valor, `valid_until` só p/ SS, `storage_path`).
- `integration_credentials` — acesso por cliente/provider; `secret_encrypted` (criptografia
  planejada, ainda não implementada — alvo: Supabase Vault / pgsodium). `status`/`expires_at`
  modelam "senha da SS expira".

## RLS

Ligado em todas as tabelas de aplicação. Leitura para autenticados; escrita via service role
(worker) que bypassa RLS. `integration_credentials` só é lida por `admin`. A função
`public.current_app_role()` resolve o papel do usuário atual.

O trigger `prevent_privileged_self_update` bloqueia o usuário de alterar o **próprio** `role`
ou `must_change_password` num self-update (a policy `update_own_profile` permite editar a
própria linha). Sob service role o `auth.uid()` é `NULL`, então admin/worker não é bloqueado.

## Bootstrap do admin

Só admin cadastra usuários, então o **primeiro** admin nasce fora do fluxo:

- **Local/dev/e2e:** `supabase/seed.sql` cria `admin@local.test` / `admin123` (role `admin`,
  `must_change_password = false`), aplicado no `pnpm db:reset`.
- **Produção:** crie o usuário manualmente (Supabase Studio → Authentication → Add user) e
  promova via SQL: `update public.profiles set role='admin', must_change_password=false where email='...';`
  (ou um script one-off usando a service role + `auth.admin.createUser`).

## Acesso a dados

Via `@toc/db`: `createDb(connectionString)` retorna um client Drizzle tipado (driver `pg`).
O schema é exportado como `schema` (`import { schema } from "@toc/db"`).
