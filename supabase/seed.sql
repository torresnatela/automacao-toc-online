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

-- ---------------------------------------------------------------------------
-- Módulo 1 (guia do IVA) — dados sintéticos para dev/e2e; NUNCA em produção.
--
-- Dá ao dashboard os quatro estados que a listagem precisa de saber desenhar
-- sem correr um único job de RPA: empresa ligada ao TOConline com guia já
-- extraída, empresa sem ligação (o botão "buscar" tem de ficar desativado),
-- equipe vizinha (para provar o isolamento por tenant) e equipe vazia.
-- Todos os ids são fixos para os testes e2e poderem referi-los.
-- ---------------------------------------------------------------------------

-- Operador da equipe demo: operator@local.test / operator123. O admin bootstrap
-- é global (sem equipe) e vê tudo — não serve para testar o escopo por tenant.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111112',
  'authenticated', 'authenticated',
  'operator@local.test',
  extensions.crypt('operator123', extensions.gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}', '{}',
  '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
values (
  '11111111-1111-1111-1111-111111111112',
  '11111111-1111-1111-1111-111111111112',
  '{"sub":"11111111-1111-1111-1111-111111111112","email":"operator@local.test"}',
  'email',
  now(), now(), now()
)
on conflict do nothing;

-- O trigger handle_new_user já criou o profile (viewer, must_change_password
-- true). Promove a operator da equipe demo e desliga a trava do 1º acesso.
update public.profiles
set role = 'operator',
    team_id = '22222222-2222-2222-2222-222222222222',
    must_change_password = false,
    full_name = 'Operador Local'
where id = '11111111-1111-1111-1111-111111111112';

-- Empresa COM ligação ao TOConline: tem (toconline_company_id, toconline_cluster),
-- portanto o worker consegue entrar nela por acesso direto.
insert into public.companies (
  id, team_id, name, nif, status,
  toconline_company_id, toconline_cluster, toconline_synced_at
)
values (
  '33333333-3333-3333-3333-333333333333',
  '22222222-2222-2222-2222-222222222222',
  'Empresa Ligada Demo', '501234560', 'active',
  515814, 5, now()
)
on conflict (id) do nothing;

-- Empresa SEM ligação: mesma equipe, sem as colunas do TOConline. É o caso que
-- a UI tem de recusar antes de enfileirar qualquer job.
insert into public.companies (id, team_id, name, nif, status)
values (
  '44444444-4444-4444-4444-444444444444',
  '22222222-2222-2222-2222-222222222222',
  'Empresa Sem Ligação Demo', '502345675', 'active'
)
on conflict (id) do nothing;

-- Árvore da guia já extraída: obrigação → período → documento.
insert into public.obligations (id, company_id, kind, frequency)
values (
  '99999999-9999-9999-9999-999999999999',
  '33333333-3333-3333-3333-333333333333',
  'iva', 'monthly'
)
on conflict (id) do nothing;

insert into public.obligation_periods (id, obligation_id, period, status, due_date)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '99999999-9999-9999-9999-999999999999',
  '2026-07', 'delivered', '2026-09-25'
)
on conflict (id) do nothing;

-- storage_path segue o layout <team>/<empresa>/<obrigação>/<período>.pdf: o
-- prefixo por equipe é o que torna a signed URL auditável. O ficheiro em si não
-- existe no bucket local — o seed povoa a listagem, não o storage.
insert into public.documents (
  id, obligation_period_id, type, entity, reference, amount,
  storage_path, status, extracted_at
)
values (
  '77777777-7777-7777-7777-777777777777',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'iva_payment', '11111', '123456789012345', 1234.56,
  '22222222-2222-2222-2222-222222222222/33333333-3333-3333-3333-333333333333/iva/2026-07.pdf',
  'extracted', now()
)
on conflict (id) do nothing;

-- Equipe vizinha, com a sua própria guia: existe para os testes provarem que o
-- operador da equipe demo NÃO a vê.
insert into public.teams (id, name, nif)
values ('55555555-5555-5555-5555-555555555555', 'Gabinete Outro', '500000018')
on conflict (id) do nothing;

insert into public.companies (id, team_id, name, nif, status)
values (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '55555555-5555-5555-5555-555555555555',
  'Empresa do Outro Gabinete', '503456780', 'active'
)
on conflict (id) do nothing;

insert into public.obligations (id, company_id, kind, frequency)
values (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'iva', 'monthly'
)
on conflict (id) do nothing;

insert into public.obligation_periods (id, obligation_id, period, status, due_date)
values (
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '2026-07', 'delivered', '2026-09-25'
)
on conflict (id) do nothing;

insert into public.documents (
  id, obligation_period_id, type, entity, reference, amount,
  storage_path, status, extracted_at
)
values (
  '88888888-8888-8888-8888-888888888888',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'iva_payment', '11111', '543210987654321', 99.99,
  '55555555-5555-5555-5555-555555555555/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/iva/2026-07.pdf',
  'extracted', now()
)
on conflict (id) do nothing;

-- Equipe sem empresas: o estado vazio da listagem também tem de ser desenhável.
insert into public.teams (id, name, nif)
values ('66666666-6666-6666-6666-666666666666', 'Gabinete Vazio', '500000026')
on conflict (id) do nothing;
