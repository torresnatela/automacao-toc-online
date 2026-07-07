-- RLS backbone (auth + observabilidade + jobs)

alter table public.profiles enable row level security;
alter table public.traces enable row level security;
alter table public.events enable row level security;
alter table public.logs enable row level security;
alter table public.jobs enable row level security;

-- Helper: papel (role) do usuário autenticado atual
create or replace function public.current_app_role() returns text
language sql stable security definer set search_path = public as $$
  select role::text from public.profiles where id = auth.uid();
$$;

-- Leitura para qualquer autenticado (dashboard). Escrita ocorre via service role, que bypassa RLS.
create policy "read_profiles" on public.profiles for select to authenticated using (true);
create policy "read_traces"   on public.traces   for select to authenticated using (true);
create policy "read_events"   on public.events   for select to authenticated using (true);
create policy "read_logs"     on public.logs     for select to authenticated using (true);
create policy "read_jobs"     on public.jobs     for select to authenticated using (true);

-- Cada usuário pode atualizar o próprio profile.
create policy "update_own_profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Cria automaticamente o profile ao criar um auth.users.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
