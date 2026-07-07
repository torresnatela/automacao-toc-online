-- RLS do domínio

alter table public.clients enable row level security;
alter table public.obligations enable row level security;
alter table public.obligation_periods enable row level security;
alter table public.documents enable row level security;
alter table public.integration_credentials enable row level security;

-- Leitura para autenticados (dashboard). Escrita via service role (worker), que bypassa RLS.
create policy "read_clients" on public.clients for select to authenticated using (true);
create policy "read_obligations" on public.obligations for select to authenticated using (true);
create policy "read_periods" on public.obligation_periods for select to authenticated using (true);
create policy "read_documents" on public.documents for select to authenticated using (true);

-- Credenciais: dados sensíveis (RGPD). Apenas admin lê; worker usa service role.
create policy "admin_read_credentials" on public.integration_credentials for select to authenticated
  using (public.current_app_role() = 'admin');
