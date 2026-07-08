-- Guard de auth: força troca de senha no 1º acesso e impede auto-escalonamento de papel.

-- handle_new_user passa a marcar must_change_password = true.
-- Fail-safe: mesmo se o UPDATE de role/flag da Server Action de cadastro falhar,
-- o usuário nunca fica sem a trava de troca de senha. O admin do seed é sobrescrito
-- para false no seed.sql.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, must_change_password)
  values (new.id, new.email, true)
  on conflict (id) do nothing;
  return new;
end; $$;

-- Impede o usuário autenticado de alterar o PRÓPRIO papel ou a PRÓPRIA flag de
-- troca de senha via self-update (a policy update_own_profile permite editar a
-- própria linha). auth.uid() é NULL sob service_role (JWT sem 'sub'), então o
-- admin/worker via service role NÃO é bloqueado. O trigger dispara sempre
-- (independente de grants de coluna), sendo o mecanismo confiável de proteção.
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
  end if;
  return new;
end; $$;

drop trigger if exists prevent_privileged_self_update on public.profiles;
create trigger prevent_privileged_self_update
  before update on public.profiles
  for each row execute function public.prevent_privileged_self_update();
