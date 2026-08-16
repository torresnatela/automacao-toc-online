-- RLS do Módulo 0 — credenciais de integração e escopo de tenant na fila.
--
-- Duas mudanças, ambas a fechar buracos que a varredura do TOConline agravaria.

-- ---------------------------------------------------------------------------
-- 1) integration_credentials: o segredo cifrado nunca sai do servidor.
--
-- A policy antiga "admin_read_credentials" deixava qualquer admin autenticado
-- fazer `select secret_encrypted from integration_credentials` por PostgREST.
-- RLS é row-level, não column-level: não há como permitir a linha e proibir a
-- coluna. Por isso a tabela base fica SEM policy de select — ilegível por
-- qualquer papel autenticado — e o dashboard passa a ler uma view que
-- simplesmente não tem a coluna do segredo.
--
-- Quem lê o segredo é só a service role (bypassa RLS): o web ao gravar, o
-- worker ao usar. O ciphertext torna-se estruturalmente incapaz de chegar ao
-- browser, em vez de depender de nos lembrarmos de não o selecionar.
-- ---------------------------------------------------------------------------
alter table public.integration_credentials enable row level security;
drop policy if exists "admin_read_credentials" on public.integration_credentials;

-- security_invoker = false (SECURITY DEFINER): a view bypassa a RLS da tabela
-- base, logo o escopo por equipe tem de ser aplicado AQUI DENTRO.
-- security_barrier impede que um predicado do chamador seja avaliado antes do
-- nosso filtro e usado como canal lateral.
create or replace view public.integration_credentials_safe
with (security_barrier = true, security_invoker = false) as
  select
    c.id,
    c.team_id,
    c.company_id,
    c.provider,
    c.username,
    c.status,
    c.expires_at,
    c.last_verified_at,
    c.metadata,
    c.created_at,
    c.updated_at,
    -- O que a UI precisa de saber sobre o segredo: se existe. Nunca o valor.
    (c.secret_encrypted is not null) as has_secret
  from public.integration_credentials c
  where c.team_id = public.current_app_team()
     or public.current_app_role() = 'admin';

revoke all on public.integration_credentials_safe from anon;
grant select on public.integration_credentials_safe to authenticated;

-- ---------------------------------------------------------------------------
-- 2) jobs: escopo por equipe.
--
-- "read_jobs" era `using (true)`: qualquer autenticado lia o payload de
-- qualquer tenant. Era dívida conhecida e tolerável enquanto a fila só tinha
-- jobs internos; deixa de ser assim que o dashboard passa a ler `jobs` para
-- acompanhar a varredura, e o payload passa a nomear equipes e credenciais.
--
-- team_id NULL = job de sistema, visível só para admin.
-- ---------------------------------------------------------------------------
alter table public.jobs enable row level security;
drop policy if exists "read_jobs" on public.jobs;
create policy "read_team_jobs" on public.jobs for select to authenticated
  using (team_id = public.current_app_team() or public.current_app_role() = 'admin');
