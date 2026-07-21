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
create policy "read_own_team" on public.teams for select to authenticated
  using (id = public.current_app_team() or public.current_app_role() = 'admin');

-- companies: leitura escopada por equipe; admin vê todas.
alter table public.companies enable row level security;
create policy "read_team_companies" on public.companies for select to authenticated
  using (team_id = public.current_app_team() or public.current_app_role() = 'admin');

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
