-- Restringe a leitura de profiles. Antes: read_profiles using(true) — qualquer
-- autenticado lia email/role/must_change_password de TODOS. Agora: cada usuário
-- lê o próprio; admin lê todos (para a página /admin/users).
drop policy if exists "read_profiles" on public.profiles;

create policy "read_own_profile" on public.profiles for select to authenticated
  using (id = auth.uid());

-- current_app_role() é SECURITY DEFINER (bypassa RLS), então não há recursão.
create policy "admin_read_all_profiles" on public.profiles for select to authenticated
  using (public.current_app_role() = 'admin');
