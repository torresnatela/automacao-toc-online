-- Módulo 1 — a listagem passa a dizer POR QUE ROTA correu o último job.
--
-- A rota deixou de ser uma variável de ambiente do dashboard e passou a ser a
-- escolha do operador em cada pedido («Buscar» = login direto na AT, «Buscar
-- via TOConline» = Acesso Direto). Com duas rotas em uso na mesma listagem, o
-- estado de uma linha só se lê inteiro sabendo qual delas o produziu — é o que
-- permite ao operador comparar as duas estratégias, e ao link «Configurar…»
-- mandar para o ecrã da rota que efetivamente correu.
--
-- `create or replace view` exige a mesma lista de colunas pela mesma ordem, com
-- os mesmos nomes e tipos — daí a coluna nova ir no FIM e o resto ser cópia
-- literal da view anterior (20260904163659).

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
    j.finished_at as job_finished_at,
    -- Adiado: `pending` porque o sistema o pôs de novo na fila, não porque
    -- ninguém lhe pegou ainda. `coalesce` para a coluna ser sempre booleana —
    -- um `null` obrigaria cada leitor a decidir o que ele significa, e a
    -- resposta certa (`false`) é a mesma para todos.
    coalesce((j.last_error->>'deferred')::boolean, false) as job_deferred,
    -- Por que rota correu o último job: é o que a listagem mostra ao lado do
    -- estado para o operador comparar as duas estratégias. `null` nos jobs
    -- anteriores a esta coluna; a web não inventa rota nenhuma nesse caso.
    j.payload->>'access' as job_access
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

-- Repetidos porque `create or replace view` não preserva o que foi concedido a
-- quem: sem estas duas linhas a view voltaria ao default (ilegível para o
-- dashboard, legível para `anon` conforme o default do schema).
revoke all on public.iva_documents_overview from anon;
grant select on public.iva_documents_overview to authenticated;
