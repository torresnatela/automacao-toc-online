-- Seed de dados para desenvolvimento local.
-- Adicione seeds por feature conforme necessário.

-- ---------------------------------------------------------------------------
-- Admin bootstrap (dev/e2e). Só admin cria usuários, então o PRIMEIRO admin
-- precisa nascer fora do fluxo. Credencial local fixa: admin@local.test / admin123.
--
-- ⚠️  CREDENCIAL FRACA E CONHECIDA — NUNCA aplique este seed em produção. O seed
--     só roda no `supabase db reset` (local); `supabase migration up` (prod) NÃO
--     executa seed.sql. Bootstrap de produção é manual — ver docs/database.md.
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated',
  'admin@local.test',
  extensions.crypt('admin123', extensions.gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}', '{}',
  '', '', '', ''
)
on conflict (id) do nothing;

-- Identidade de email (GoTrue moderno exige row em auth.identities p/ login por senha).
insert into auth.identities (
  provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
values (
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"admin@local.test"}',
  'email',
  now(), now(), now()
)
on conflict do nothing;

-- O trigger handle_new_user já criou o profile (role viewer, must_change_password
-- true). Promove a admin e desliga a trava de troca de senha.
update public.profiles
set role = 'admin', must_change_password = false, full_name = 'Admin Local'
where id = '11111111-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------------------
-- Equipe demo (gabinete) para desenvolvimento/e2e: dá uma equipe onde cadastrar
-- empresas. O admin bootstrap fica SEM equipe (team_id NULL = admin global, vê tudo).
-- ---------------------------------------------------------------------------
insert into public.teams (id, name, nif)
values ('22222222-2222-2222-2222-222222222222', 'Gabinete Demo', '500000000')
on conflict (id) do nothing;
