-- RLS multi-tenant: equipes (gabinetes) + empresas clientes, escopadas por equipe.
-- Leitura para o autenticado da própria equipe; admin (global) vê tudo. Escrita
-- ocorre via service role (cliente admin do dashboard/worker), que bypassa RLS,
-- com checagem de papel/equipe na camada de aplicação.

-- Helper: equipe (team_id) do usuário autenticado atual. SECURITY DEFINER para
-- ler public.profiles sem recursão de policy (espelha current_app_role()).
create or replace function public.current_app_team() returns uuid
language sql stable security definer set search_path = public as $$
  select team_id from public.profiles where id = auth.uid();
$$;

-- teams: cada usuário lê a própria equipe; admin lê todas.
alter table public.teams enable row level security;
drop policy if exists "read_own_team" on public.teams;
create policy "read_own_team" on public.teams for select to authenticated
  using (id = public.current_app_team() or public.current_app_role() = 'admin');

-- companies: leitura escopada por equipe; admin vê todas.
alter table public.companies enable row level security;
drop policy if exists "read_team_companies" on public.companies;
create policy "read_team_companies" on public.companies for select to authenticated
  using (team_id = public.current_app_team() or public.current_app_role() = 'admin');

-- Tabelas-filhas do tenant (obligations → obligation_periods → documents): antes
-- eram `using(true)` (herdadas de 20260707004539_domain_rls.sql), o que vazava os
-- dados sensíveis (caminhos de PDFs, valores) entre equipes. Reescopa por equipe
-- subindo a árvore até companies.team_id. Os EXISTS usam current_app_team()/role,
-- ambos SECURITY DEFINER, sem recursão de policy.
drop policy if exists "read_obligations" on public.obligations;
create policy "read_team_obligations" on public.obligations for select to authenticated
  using (
    public.current_app_role() = 'admin'
    or exists (
      select 1 from public.companies c
      where c.id = obligations.company_id
        and c.team_id = public.current_app_team()
    )
  );

drop policy if exists "read_periods" on public.obligation_periods;
create policy "read_team_periods" on public.obligation_periods for select to authenticated
  using (
    public.current_app_role() = 'admin'
    or exists (
      select 1
      from public.obligations o
      join public.companies c on c.id = o.company_id
      where o.id = obligation_periods.obligation_id
        and c.team_id = public.current_app_team()
    )
  );

drop policy if exists "read_documents" on public.documents;
create policy "read_team_documents" on public.documents for select to authenticated
  using (
    public.current_app_role() = 'admin'
    or exists (
      select 1
      from public.obligation_periods p
      join public.obligations o on o.id = p.obligation_id
      join public.companies c on c.id = o.company_id
      where p.id = documents.obligation_period_id
        and c.team_id = public.current_app_team()
    )
  );

-- Estende o guard de self-update para também impedir o usuário de trocar a
-- PRÓPRIA equipe (a policy update_own_profile permite editar a própria linha).
-- Só a service role (auth.uid() NULL) muda team_id — via admin atribuindo equipe.
create or replace function public.prevent_privileged_self_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and auth.uid() = old.id then
    if new.role is distinct from old.role then
      raise exception 'nao e permitido alterar o proprio papel';
    end if;
    if new.must_change_password is distinct from old.must_change_password then
      raise exception 'nao e permitido alterar o proprio must_change_password';
    end if;
    if new.team_id is distinct from old.team_id then
      raise exception 'nao e permitido alterar a propria equipe';
    end if;
  end if;
  return new;
end; $$;
