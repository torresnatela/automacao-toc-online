-- Módulo 1 — guia de pagamento do IVA: onde o PDF vive e como o dashboard o lê.
--
-- Três peças, todas com a mesma lógica de fundo: o que o browser vê é sempre
-- uma projeção escolhida por nós, nunca a linha crua.

-- ---------------------------------------------------------------------------
-- 1) Bucket privado para os PDFs das guias.
--
-- Existe também em supabase/config.toml (stack local), mas o config.toml não
-- corre em produção — por isso a criação vive aqui. Idempotente: um `db reset`
-- local aplica a migration por cima do bucket que o config.toml já criou, e o
-- `do update` garante que os dois nunca divergem.
--
-- 10 MiB e só application/pdf: a guia da AT é um PDF de poucas centenas de KB;
-- o limite é uma barreira contra usar este bucket para outra coisa.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760, '{application/pdf}')
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 2) storage.objects: DELIBERADAMENTE sem policy para `authenticated`.
--
-- Não é esquecimento. A regra de quem pode ver um PDF é a mesma da linha
-- `documents` que lhe corresponde — e essa regra já está escrita, em
-- read_team_documents (20260721224512_tenancy_rls.sql), a subir a árvore
-- período → obrigação → empresa → equipe. Reescrevê-la em cima do nome do
-- ficheiro seria duplicá-la num sítio onde ninguém a lembraria de atualizar.
--
-- Então o objeto é ilegível por qualquer papel autenticado, e o acesso passa
-- por uma signed URL mintada pelo servidor DEPOIS de a linha `documents` ser
-- visível sob RLS ao utilizador que pede. Mesma lógica do segredo em
-- integration_credentials_safe: o dado sensível torna-se estruturalmente
-- inalcançável por PostgREST/storage-api, em vez de depender de uma policy
-- correta.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 3) View de leitura da listagem do Módulo 1.
--
-- security_invoker = true (ao contrário de integration_credentials_safe): aqui
-- NÃO queremos bypassar a RLS das tabelas base — queremos exatamente o
-- contrário, que as policies por equipe de companies/obligations/
-- obligation_periods/documents/jobs se apliquem ao chamador. O escopo por
-- tenant já está escrito uma vez; a view herda-o em vez de o repetir.
-- security_barrier impede que um predicado do chamador seja avaliado antes dos
-- nossos filtros e usado como canal lateral.
--
-- Uma linha por empresa (left joins): a empresa que ainda não tem obrigação de
-- IVA aparece na mesma, com os campos do período/documento/job a nulo — é o
-- estado "por buscar" da listagem, e não teria como aparecer com inner join.
-- ---------------------------------------------------------------------------
create or replace view public.iva_documents_overview
with (security_invoker = true, security_barrier = true) as
  select
    c.id as company_id,
    c.team_id,
    c.name as company_name,
    c.nif,
    c.status as company_status,
    c.toconline_company_id,
    c.toconline_cluster,
    p.id as period_id,
    p.period,
    p.status as period_status,
    p.due_date,
    d.id as document_id,
    d.entity,
    d.reference,
    d.amount,
    d.valid_until,
    d.status as document_status,
    -- O que a UI precisa de saber sobre o ficheiro: se existe. O caminho NUNCA
    -- sai daqui — quem o soubesse poderia pedir a signed URL de outra equipe.
    (d.storage_path is not null) as has_file,
    d.extracted_at,
    j.id as job_id,
    j.status as job_status,
    -- Desfecho legível: sucesso e "não havia nada a buscar" vêm de `result`,
    -- a falha vem de `last_error`. Um único campo porque a UI mostra um único
    -- selo por empresa.
    coalesce(j.result->>'outcome', j.result->>'reason', j.last_error->>'outcome') as job_outcome,
    j.result->>'period' as job_period,
    j.payload->>'batchId' as job_batch_id,
    j.last_error->>'message' as job_error,
    j.trace_id as job_trace_id,
    j.attempts as job_attempts,
    j.created_at as job_created_at,
    j.finished_at as job_finished_at
  from public.companies c
  left join public.obligations o
    on o.company_id = c.id and o.kind = 'iva'
  -- Laterais e não joins simples: queremos O período mais recente e O último
  -- job, não todos — um join simples multiplicaria a linha da empresa.
  left join lateral (
    select *
    from public.obligation_periods p
    where p.obligation_id = o.id
    order by p.due_date desc nulls last, p.created_at desc
    limit 1
  ) p on true
  left join lateral (
    select *
    from public.documents d
    where d.obligation_period_id = p.id and d.type = 'iva_payment'
    limit 1
  ) d on true
  left join lateral (
    select *
    from public.jobs j
    where j.company_id = c.id and j.type = 'rpa.fetch_iva_document'
    order by j.created_at desc
    limit 1
  ) j on true;

-- Os literais 'iva', 'iva_payment' e 'rpa.fetch_iva_document' espelham
-- IVA_OBLIGATION_KIND / IVA_DOCUMENT_TYPE / IVA_DOCUMENT_JOB_TYPE em
-- @toc/core/domain — mudá-los lá obriga a uma migration aqui. O smoke test
-- iva-documents.smoke.test.ts importa as constantes e prova a correspondência,
-- para a divergência falhar num teste em vez de numa listagem vazia.

revoke all on public.iva_documents_overview from anon;
grant select on public.iva_documents_overview to authenticated;
