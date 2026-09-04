# Módulo 1: Guia de Pagamento do IVA (TOConline → AT) — Design

- **Data:** 2026-09-03
- **Branch:** `feat/modulo-1-iva-guia`
- **Autor:** brainstorming com o utilizador
- **Contexto de origem:** `docs/context/project-context.md` §4.2; Módulo 0 (`docs/superpowers/specs/2026-07-06-project-foundation-design.md`)
- **Estado:** aprovado — fonte para a implementação via SDD

> Plano de execução: este documento é a fonte; a implementação segue o SDD em branch `feat/modulo-1-iva-guia`.

> Base: worktree `/Users/gabrieltorresbolognani/automacao-toc-online-main` (origin/main @ 215ef88, Módulo 0).
> Todos os caminhos de ficheiro deste documento são relativos a essa raiz.

---

## 1. Objetivo

Este módulo adiciona a **primeira extração real**: com um clique (por empresa ou em lote), o worker chega ao
Portal das Finanças da empresa, consulta a declaração periódica de IVA mais recente, obtém o **documento de
pagamento** (PDF + entidade/referência/valor), guarda o PDF no Storage e regista tudo no modelo. Uma
**listagem de guias** mostra o resultado de cada tentativa — sucesso ou não — com **orientação do que fazer**.

---

## 2. Contexto e decisões com o utilizador

O gargalo do gabinete (`docs/context/project-context.md` §4.2) é ir buscar, cliente a cliente, a guia de
pagamento de cada obrigação nos portais e enviá-la. O Módulo 0 já liga o gabinete ao TOConline e importa a
carteira de empresas; o modelo `obligations → obligation_periods → documents` existe e está migrado, mas
**nenhum código de produção o preenche**, não há bucket de Storage e só existe um tipo de job.

### Decisões fechadas com o usuário

- Reaproveitar o Módulo 0 ao máximo (worker, fila, sessão, cifra, tracer, padrões web).
- Clique **por empresa** e **em lote** (um job por empresa; worker serial).
- Período = **a declaração mais recente no portal**; período lido do portal, gravado em `obligation_periods.period`.
- Guardar **PDF + campos** (entidade/referência/valor) na listagem.
- **Rota de acesso à AT = porta dupla**: adaptador trocável; a **Fase 0 (reconhecimento com credenciais reais)** decide entre
  (A) Acesso Direto do TOConline e (B) login direto na AT com a credencial do Contabilista Certificado.
- Fora de escopo: envio por e-mail, lembretes, outros impostos (o desenho deixa `irs_retencao`/`dmr`/`ss_contribuicoes` prontos a entrar).

---

## 3. Achados da pesquisa que moldam o desenho

1. **Acesso Direto exige Chrome real + extensão "TOConline Connect"** (manual TOConline). O Chromium do
   Playwright não carrega extensões da Web Store → rota A precisa de `launchPersistentContext` com
   `channel: "chrome"` e a extensão descompactada. As senhas dos portais ficam cifradas dentro do TOConline
   e **não podem ser lidas** por nós.
2. **Existem endpoints "por Contabilista Certificado"** no Portal das Finanças:
   `iva.portaldasfinancas.gov.pt/dpiva/portal/cc/consultar-declaracao`, `/dpiva/portal/cc/obter-doc-pagamento`,
   `/pagantiva/listaClientesToc/entrar`. Se funcionarem com a credencial do gabinete, a rota B faz **um**
   login para as 182 empresas, sem extensão. Não confirmado sem autenticar.
3. **2FA no Portal das Finanças** está a ser estendido a empresas (obrigatório ~abr/2026). A OCC recomenda
   "subcontas espelho"; nenhuma fonte confirma que são isentas de 2FA. **Incógnita de maior risco do projeto.**
4. **Correções ao `project-context.md`** (atualizar na Fase 0): IVA **entrega até dia 20, paga até dia 25**
   (o doc diz "dia 20 = pagamento"); existe regime **trimestral** (< €650k, provavelmente a maioria da
   carteira); a guia da AT **tem** horizonte de validade derivável (dia 25), não impresso.
5. A "referência de acesso direto" guardada pelo Módulo 0 **não é URL**: é o par
   `companies.toconline_company_id + toconline_cluster`; entrar na empresa é impersonation JS
   (`switchToEntityAndNotifyPages`). `browser.ts:4-16` já reserva a costura "um contexto por empresa" para
   este módulo.

---

## 4. Arquitetura (o que se reaproveita e o que nasce)

```
dashboard (/documentos/iva)                       worker
  Buscar / Buscar todas                            WorkerLoop.tick()  → JobQueue.claimNext("rpa.fetch_iva_document")
   └ enqueueIvaFetch(company)                        └ IvaDocumentRunner.run(job)
      ├ readiness (pura, core)                           ├ pré-condições SEM browser (empresa, credencial, idempotência, cap diário, gate)
      ├ startAction → job.enqueued → handOff()           ├ AtSessionFactory.open()   ← rota A (TOConline+extensão) | rota B (acesso.gov)
      └ insert jobs {team_id, company_id, trace_id…}     ├ IvaDeclarationReader.readMostRecent()  → período
                                                         ├ PaymentDocumentFetcher.fetch()         → PDF + campos | "sem documento"
  AutoRefresh (router.refresh 5s)                        ├ DocumentStore.put()  (Storage: <team>/<company>/iva/<period>.pdf)
  view iva_documents_overview (RLS)                      └ ObligationLedger.recordDocument()  (obligations → periods → documents)
  GET /api/documents/[id]/download → 302 signed URL     outcome → jobs.result.outcome | jobs.last_error.outcome
```

Reaproveitado sem alteração: `JobQueue` (claim atómico, backoff 1/4/9 min, 3 tentativas), `WorkerLoop`
(serial), `PlaywrightTocSessions` + `storageState`, `DbCredentialSource` + `@toc/core/crypto`,
`TraceHandle/EventHandle` (re-hidratação do trace do dashboard), `startAction/handOff`, `AutoRefresh`,
`StatusBadge`, `DataTable`, `resolveTeamScope`, padrão de migrations (`pnpm db:generate` + `_rls.sql` à mão).

Molde a copiar linha a linha: `apps/worker/src/runner/company-scan-runner.ts` (trace re-hidratado `:63-67`,
credencial antes do browser `:81-96`, `closeEarly` `:235-258`, regra única
`retry = !(err instanceof StructuralError)` `:197`, `finally` `:202-206`),
`apps/web/src/lib/integrations/service.ts:283-349` (enqueue + idempotência + `handOff`),
`apps/worker/src/toconline/session.ts` (login, reuse, deteção de recusa por redação),
`apps/worker/src/sinks/company-directory.ts:127-130` (predicado redundante de equipa em toda escrita).

---

## 5. Mapa de casos (o coração do pedido)

Princípios: o **desfecho (`outcome`)** é ortogonal ao `jobs.status`; **`skipped`** = sabia-se antes de tentar
ou é estado válido do domínio, **`failed`** = tentou-se e não concluiu; **nunca retentar senha rejeitada**
(cada tentativa consome uma do contador da AT); **"sem documento" não é exceção** — é um valor devolvido pela
porta; estado do período **nunca regride** de `delivered`/`paid`; a credencial é marcada **pelo que o portal
disse sobre ela**, nunca pelo que disse sobre a empresa; **RGPD**: `result`/`last_error`/eventos só levam
uuids, período, datas, contagens e códigos.

Legenda — Job: `ok` succeeded · `skip` skipped · `fail·R` failed retentável · `fail·NR` failed sem retry.
Período: `—` sem linha · `keep` não toca · `error*` só se não for delivered/paid. **F0** = só distinguível
depois do reconhecimento revelar a redação do portal; até lá colapsa no código entre parênteses.

### 5.1 Sucesso e estados válidos (casos 1 e 3 do pedido)

| `outcome`                   | Quando                                                  | Job  | Período                   | Credencial | Rótulo                               | Orientação                                                                                                                        | F0        |
| --------------------------- | ------------------------------------------------------- | ---- | ------------------------- | ---------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `fetched`                   | PDF + campos lidos                                      | ok   | `delivered` (+`due_date`) | verify     | Guia obtida                          | Guia de {period} guardada. Envie-a ao cliente: pagamento até {dueDate}.                                                           |           |
| `fetched_without_fields`    | PDF ok, campos ilegíveis                                | ok   | `delivered`               | verify     | Guia obtida (sem dados de pagamento) | O PDF de {period} foi guardado, mas não foi possível ler entidade/referência/valor. Confira-os no PDF antes de enviar.            | ✔         |
| `already_fetched`           | período já `delivered` com ficheiro                     | skip | keep                      | —          | Já obtida                            | Nada a fazer: a guia de {period} já estava guardada. Use «Buscar novamente» para forçar.                                          |           |
| `no_payment_document`       | portal diz que não há documento (IVA a recuperar/zero)  | skip | `skipped_nonexistent`     | verify     | Sem imposto a pagar                  | Nada a fazer: a declaração de {period} não gera documento de pagamento. Não há guia para enviar.                                  | ✔ redação |
| `already_paid`              | portal indica pago                                      | skip | `paid`                    | verify     | IVA já pago                          | Nada a fazer: o portal indica que o IVA de {period} já está pago.                                                                 | ✔         |
| `document_not_ready`        | declaração entregue, documento ainda não emitido        | skip | `pending`                 | —          | Guia ainda não disponível            | A AT ainda não disponibilizou o documento de {period}. Volte a tentar mais tarde.                                                 | ✔         |
| `declaration_not_submitted` | período esperado (`nextDuePeriod`) ainda sem declaração | skip | `pending` (+`due_date`)   | verify     | Declaração por entregar              | A declaração de {period} ainda não consta do portal (entrega até {filingDeadline}). Depois de a entregar, volte a buscar.         |           |
| `declaration_not_found`     | nenhuma declaração de IVA para a empresa                | skip | —                         | verify     | Sem declarações de IVA               | O portal não apresenta declarações periódicas de IVA. Confirme o enquadramento; se isenta, marque a obrigação como não aplicável. |           |

### 5.2 Pré-condição (antes de qualquer browser)

| `outcome`                          | Quando                                                             | Job                                              | Período | Credencial                            | Rótulo                              | Orientação                                                            |
| ---------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------ | ------- | ------------------------------------- | ----------------------------------- | --------------------------------------------------------------------- |
| `payload_invalid`                  | payload incompleto / modo de acesso não suportado                  | fail·NR                                          | —       | —                                     | Pedido inválido                     | Volte a pedir a guia; se persistir, contacte o suporte técnico.       |
| `company_not_found`                | empresa não existe na equipa                                       | fail·NR                                          | —       | —                                     | Empresa não encontrada              | Atualize a lista de empresas.                                         |
| `company_inactive`                 | `companies.status != active`                                       | skip                                             | —       | —                                     | Empresa inativa                     | Se retomou atividade, altere o estado na ficha e volte a buscar.      |
| `obligation_not_applicable`        | período marcado `not_applicable` por humano                        | skip                                             | keep    | —                                     | IVA não aplicável                   | Se o enquadramento mudou, reative a obrigação na ficha da empresa.    |
| `company_not_linked` (rota A)      | sem `toconline_company_id`/`cluster`                               | skip                                             | —       | —                                     | Sem ligação ao TOConline            | Corra a varredura em Integrações → TOConline e volte a buscar.        |
| `company_nif_missing` (rota B)     | sem NIF                                                            | skip                                             | —       | —                                     | Empresa sem NIF                     | Preencha o NIF na ficha da empresa.                                   |
| `toconline_credential_missing` (A) | sem credencial TOConline                                           | skip                                             | —       | —                                     | Ligação ao TOConline por configurar | Configure em Integrações → TOConline.                                 |
| `toconline_credential_invalid` (A) | credencial já `invalid`                                            | skip                                             | —       | (já marcada)                          | Senha do TOConline inválida         | Atualize-a em Integrações → TOConline; desbloqueia todas as empresas. |
| `at_credential_missing` (B)        | sem credencial `at` (equipa ou empresa)                            | skip                                             | —       | —                                     | Senha da AT por configurar          | Configure em Integrações → Autoridade Tributária.                     |
| `at_credential_invalid` (A e B)    | credencial `at` `invalid`/`expired` (ou linha-marcador da empresa) | skip                                             | —       | (já marcada; `details.invalidReason`) | Senha da AT marcada como inválida   | Corrija a causa ({invalidReason}) e volte a guardar a credencial.     |
| `daily_cap_reached`                | ≥ N tentativas hoje para a empresa                                 | skip                                             | —       | —                                     | Limite diário atingido              | Já se tentou {n} vezes hoje. Volte amanhã ou contacte o suporte.      |
| `portal_paused`                    | gate disparado por indisponibilidade recente                       | **deferred** (volta à fila sem gastar tentativa) | —       | —                                     | Portal em pausa                     | O sistema pausou o acesso à AT por indisponibilidade; retoma sozinho. |
| _job já em curso_                  | unique parcial em `jobs`                                           | (não há job)                                     | —       | —                                     | —                                   | Dashboard devolve `alreadyRunning`.                                   |

> **Como `portal_paused` chega à interface.** É o único desfecho que não deixa o job num estado
> terminal: `defer` devolve-o a `pending` (sem gastar tentativa) e marca `last_error.deferred = true`.
> A view achataria isso em "Na fila" como qualquer outro `pending`, e uma indisponibilidade da AT
> apareceria como 182 empresas eternamente na fila. Por isso a view expõe **`job_deferred`**
> (`coalesce((last_error->>'deferred')::boolean, false)`, migration `20260904163659`) e `deriveState`
> separa as duas esperas. A linha continua "em curso" para efeitos do botão — a mesma execução
> retoma daqui a 15 min.

### 5.3 Sessão TOConline e Acesso Direto (só rota A) — caso 2 do pedido, parte TOConline

| `outcome`                         | Quando                                | Job     | Credencial                                                  | Rótulo                              | Orientação                                                                              | F0                                    |
| --------------------------------- | ------------------------------------- | ------- | ----------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------- |
| `toconline_login_rejected`        | `InvalidCredentialsError` (já existe) | fail·NR | toconline → `invalid`                                       | Senha do TOConline rejeitada        | Atualize-a em Integrações → TOConline; até lá todas as empresas ficam por obter.        |                                       |
| `toconline_unavailable`           | timeout/5xx/rede                      | fail·R  | —                                                           | TOConline não respondeu             | O sistema volta a tentar (até 3×).                                                      |                                       |
| `toconline_unexpected_page`       | host/grid inesperado                  | fail·NR | —                                                           | TOConline com página inesperada     | Consulte o trace e contacte o suporte — o portal pode ter mudado.                       |                                       |
| `direct_access_extension_missing` | extensão ausente no perfil            | fail·NR | —                                                           | Extensão TOConline Connect em falta | Intervenção técnica: sem ela o Acesso Direto não funciona.                              | ✔ (colapsa em `direct_access_failed`) |
| `direct_access_not_configured`    | TOConline sem senha AT da empresa     | skip    | marcador `at`/empresa → `invalid` (`senha_nao_configurada`) | Acesso direto por configurar        | Registe a senha da AT em TOConline → Empresa → Senhas da empresa e volte a buscar.      | ✔                                     |
| `direct_access_failed`            | popup não abre / sem diagnóstico      | fail·R  | —                                                           | Acesso direto falhou                | O sistema volta a tentar; se persistir, teste o Acesso Direto manualmente no TOConline. | ✔                                     |

### 5.4 Autenticação na AT (ambas as rotas) — caso 2 do pedido, parte AT

| `outcome`                  | Quando                                                                | Job                       | Credencial                                                                   | Rótulo                                    | Orientação                                                                                                                                                                                      | F0                         |
| -------------------------- | --------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `at_login_rejected`        | "Ocorreu um erro na tentativa de autenticação… tem mais X tentativas" | fail·NR **nunca retenta** | at (equipa/empresa/marcador) → `invalid` (`login_rejeitado`, `attemptsLeft`) | Senha da AT rejeitada                     | A AT recusou a senha ({attemptsLeft} tentativas antes do bloqueio). **Não volte a tentar sem corrigir**: verifique nas Senhas da empresa do TOConline (rota A) ou em Integrações → AT (rota B). | parse de X                 |
| `at_password_blocked`      | conta bloqueada por excesso                                           | fail·NR                   | at → `invalid` (`senha_bloqueada`)                                           | Senha da AT bloqueada                     | Peça nova senha no Portal das Finanças (Recuperar senha): chega por carta em ~5 dias úteis.                                                                                                     | ✔ (→ `at_login_rejected`)  |
| `at_password_expired`      | portal exige troca                                                    | fail·NR                   | at → `expired` (`senha_expirada`)                                            | Senha da AT expirada                      | Entre manualmente no portal, defina a nova senha e atualize-a no TOConline / Integrações → AT.                                                                                                  | ✔ (→ `at_unexpected_page`) |
| `at_2fa_required`          | página de código SMS                                                  | fail·NR                   | at → `expired` (`2fa_exigido`) — para o lote parar na pré-condição           | AT pede código por SMS                    | O sistema não recebe SMS. Use uma subconta/utilizador sem 2FA (ou faça login assistido: `seed-at-session`) e volte a buscar.                                                                    | ✔ (→ `at_unexpected_page`) |
| `at_authorization_missing` | CC sem autorização para o NIF (expira 1 ano+1 dia)                    | fail·NR                   | — (senha certa)                                                              | Sem autorização na AT                     | Renove a autorização de acesso a terceiros no Portal das Finanças para esta empresa.                                                                                                            | ✔                          |
| `at_session_mismatch`      | NIF da sessão ≠ NIF da empresa (guarda)                               | fail·NR                   | —                                                                            | Sessão de outro contribuinte              | Nada foi guardado. Verifique o acesso desta empresa e contacte o suporte.                                                                                                                       |                            |
| `at_unexpected_page`       | captcha, manutenção, consentimento, layout novo (`details.stage`)     | fail·NR                   | —                                                                            | Portal das Finanças com página inesperada | Consulte o trace e contacte o suporte técnico.                                                                                                                                                  |                            |
| `at_unavailable`           | timeout sem aviso, 5xx, rede (dispara o gate)                         | fail·R                    | —                                                                            | Portal das Finanças não respondeu         | O sistema volta a tentar; é frequente entre os dias 20 e 25.                                                                                                                                    |                            |

### 5.5 Captura do documento

| `outcome`                  | Quando                                                               | Job     | Período  | Rótulo                               | Orientação                                                   | F0                    |
| -------------------------- | -------------------------------------------------------------------- | ------- | -------- | ------------------------------------ | ------------------------------------------------------------ | --------------------- |
| `document_type_unexpected` | veio outra coisa (ex.: guia P2 fora de prazo)                        | fail·NR | `error*` | Documento não é a guia da declaração | Nada foi guardado. Verifique manualmente no portal.          | ✔                     |
| `document_capture_failed`  | sem download/popup a tempo, HTML em vez de PDF, sem `%PDF`, truncado | fail·R  | `error*` | Falha ao descarregar a guia          | O sistema volta a tentar; se persistir, obtenha manualmente. | download/inline/popup |
| `document_fields_mismatch` | NIF do PDF ≠ empresa, ou valor PDF ≠ página (guarda)                 | fail·NR | `error*` | Guia não corresponde à empresa       | Nada foi guardado. Contacte o suporte técnico.               |                       |

### 5.6 Persistência e infraestrutura

| `outcome`          | Quando                                                                                               | Job     | Período               | Rótulo                | Orientação                                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------- | ------- | --------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `persist_failed`   | Storage/BD indisponível (upload idempotente por caminho → repetir é seguro)                          | fail·R  | `error*`              | Falha ao guardar      | O sistema volta a tentar automaticamente.                                                                                                      |
| `persist_rejected` | Storage/BD recusaram a escrita (4xx, cross-team, dados inválidos) — erro estrutural, não transitório | fail·NR | `error*`              | Gravação recusada     | O armazenamento ou a base de dados recusaram a gravação (configuração ou dados inconsistentes). Nada foi guardado. Contacte o suporte técnico. |
| `interrupted`      | job `running` órfão (worker morreu) — escrito pelo _reaper_                                          | fail·R  | `error*` se conhecido | Execução interrompida | Volte a pedir a guia.                                                                                                                          |
| `unknown_error`    | qualquer outro                                                                                       | fail·R  | `error*` se conhecido | Erro inesperado       | Veja o trace; se persistir, contacte o suporte.                                                                                                |

Estados só de UI (não são `outcome`): `queued` "Na fila", `running` "A obter…", `never` "Nunca buscada",
`failed_unknown` "Falhou" (linha antiga sem `outcome`).

---

## 6. Contrato de domínio — `packages/core/src/domain/at/` (novo; barrel em `domain/index.ts`)

Molde: `packages/core/src/domain/toconline/types.ts:149-189` (constantes declaradas **uma vez** porque
`jobs.payload/result` são jsonb e web/worker são deployables distintos).

| Ficheiro        | Exporta                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`      | `IVA_DOCUMENT_JOB_TYPE = "rpa.fetch_iva_document"`, `IVA_DOCUMENT_TYPE = "iva_payment"` (`documents.type`), `AtAccessMode = "toconline_direct_access" \| "at_direct_login"`, `IvaDocumentJobPayload { teamId, companyId, access, credentialId, credentialScope: "team"\|"company", period?, force?, batchId? }`, `IvaDocumentJobResult` + `IVA_RESULT_KEYS as const` (com o tipo-guarda `Exclude<keyof Result, Keys> extends never`), `IvaOutcomeDetails { period?, frequency?, dueDate?, filingDeadline?, attemptsLeft?, stage?, invalidReason?, obligationPeriodId?, documentId?, access? }`, `IvaStage`                                              |
| `outcomes.ts`   | `IVA_OUTCOME_CODES as const` (todos os códigos de §5, incl. os F0 — acrescentar depois é erro de compilação nos dois lados), `IvaOutcome`, `IvaOutcomeSpec { jobStatus, retry, severity: "ok"\|"wait"\|"action"\|"support", periodStatus, credential: null\|"verify"\|"invalidate"\|"expire", phase0, label, guidance }`, `IVA_OUTCOMES: Record<IvaOutcome, IvaOutcomeSpec>`, `INVALID_REASON_LABELS`, `renderGuidance(outcome, details)` (formata período/datas em PT), `readIvaOutcome(jobRow)` → `{kind:"in_flight"} \| {kind:"outcome", outcome, details}` (único sítio que conhece as 3 formas: `result` / `result.reason` / `last_error.outcome`) |
| `period.ts`     | `parsePeriod(raw)` total (aceita `2026/07`, `07/2026`, `julho de 2026`, `2026 3T`, `3.º trimestre 2026`, `2026-Q3`…) → `{ok, period: "YYYY-MM"\|"YYYY-Qn", frequency, year, index}`; `CANONICAL_PERIOD` regex; `comparePeriods`; `formatPeriodPt`; `nextDuePeriod(today, frequency)`                                                                                                                                                                                                                                                                                                                                                                    |
| `due-date.ts`   | `derivePaymentDueDate(period)` → entrega dia 20 / pagamento dia 25 do 2.º mês seguinte; **extensão de verão** (agosto → setembro) como regra com `summerExtension:false`; **dia útil** como regra (feriados fixos + Páscoa por computus), não tabela                                                                                                                                                                                                                                                                                                                                                                                                    |
| `document.ts`   | `RawDocumentFields`, `normalizeDocumentFields(raw)` total (entidade 5 dígitos, referência 15, valor PT `1.234,56 €` → `"1234.56"`; ressalvas por **código**, nunca valor), `documentFieldsComplete`, `taxIdMatches`                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `credential.ts` | `selectAccessCredential(access, companyId, candidates)` → A: `toconline` de equipa; B: `at` da empresa senão `at` de equipa; marcador `at`/empresa inválido bloqueia em qualquer modo                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `readiness.ts`  | `ivaFetchReadiness({access, company, credential, inFlight})` → `{ready} \| {ready:false, reason}`; `planBulkFetch(rows, {onlyMissing, now})`; `providerForAccess(access)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

**Rótulos e orientação vivem em core, não no web**: são conhecimento de domínio (carta da AT ~5 dias úteis,
autorização expira ao ano, nunca retentar senha), reutilizáveis pelo envio futuro, e o
`Record<IvaOutcome, …>` verifica completude em compilação. O web só mapeia `severity → tone` e acrescenta os
4 estados de UI.

`packages/core/src/domain/types.ts` ganha `OBLIGATION_PERIOD_STATUSES`/`DOCUMENT_STATUSES` `as const`
espelhando os pgEnums (+ smoke test em `packages/db/test` a compará-los).

---

## 7. Modelo de dados e Storage

**Sem alteração de enums.** Todos os desfechos cabem em `obligation_period_status` (`delivered`, `paid`,
`skipped_nonexistent`, `pending`, `error`, `not_applicable`) e o `outcome` vive em `jobs` (a tentativa **é**
o job; metade dos casos não tem período).

Drizzle (`pnpm db:generate` → `<ts>_<gerado>.sql`):

- `packages/db/src/schema/jobs.ts`: `companyId uuid → companies.id onDelete set null`; índice
  `jobs_company_latest_idx (team_id, type, company_id, created_at desc)`; **unique parcial**
  `jobs_company_inflight_uq (company_id, type) where status in ('pending','running')` — idempotência por
  empresa garantida pela BD (`23505` → `alreadyRunning`).
- `packages/db/src/schema/domain.ts`: `unique obligation_company_kind_uq (company_id, kind)` (sem isto o
  upsert da obrigação não é exprimível); `unique document_period_type_uq (obligation_period_id, type)` (nova
  busca substitui, não acumula).

À mão `supabase/migrations/<ts+1s>_iva_documents_rls.sql` (precedente: `20260816215656_integrations_rls.sql`):

- `insert into storage.buckets ('documents', public=false, 10 MiB, '{application/pdf}') on conflict do update`.
- **Sem policy** em `storage.objects` para `authenticated` (comentário explícito): leitura só por signed URL
  mintada pelo servidor depois de a linha `documents` ser visível sob RLS — mesma lógica de
  `integration_credentials_safe`.
- View `public.iva_documents_overview` **`security_invoker = true`** (RLS das tabelas base aplica-se):
  `companies` ⟕ `obligations(kind='iva')` ⟕ lateral último `obligation_periods` (por `due_date desc`) ⟕
  lateral `documents(type='iva_payment')` ⟕ lateral último `jobs(type='rpa.fetch_iva_document')`; expõe
  `has_file` e **nunca `storage_path`**; `job_outcome = coalesce(result->>'outcome', result->>'reason',
last_error->>'outcome')`. O literal do tipo de job é o único drift SQL↔TS: smoke test insere um job com a
  constante importada e verifica que a view o devolve.
- `supabase/config.toml`: **não** declara o bucket. Ele é criado só pela migration acima — que é a
  única peça que corre nos dois sítios (local e produção). Declará-lo também no `config.toml` daria
  duas fontes para os mesmos limites, e a de produção nunca leria a outra; o `config.toml` fica com
  um comentário a dizer onde o bucket nasce.
- `supabase/seed.sql`: utilizador **operator** (`operator@local.test/operator123`, `team_id=DEMO_TEAM`),
  empresa ligada (`toconline_company_id`+`cluster`, NIF com checksum), empresa sem ligação, árvore
  `obligations→period→document` para a ligada, equipa "Gabinete Outro" (cross-team) e "Gabinete Vazio"
  (empty state).

Caminho no Storage: `<team_id>/<company_id>/iva/<period>.pdf` — determinístico (upsert), sem PII, team
primeiro (permite policy por pasta no futuro). `jobId` vai em `documents.metadata`.

---

## 8. Worker

### 8.1 Ports (`apps/worker/src/runner/ports.ts`, acrescentar)

`PortalCredentials` (alias de `TocOnlineCredentials`); `CredentialLookup` ganha `provider` e `scope
{teamId, companyId|null}`; `AtCredentialSource extends CredentialSource { findFor({teamId, companyId,
provider}); markExpired(id, reason) }`; `AtCompanyHandle { id, nif, tocCompanyId, tocCluster }`;
`AtSessionFactory { access, credentialProvider: "at"|"toconline", precondition(company) (pura),
open({company, credentialId, credentials, scope}) → { session: AuthenticatedAtSession {page, access, urls,
host, close()}, reused } }`; (`access` é o `AtAccessMode` — por que **rota** se chegou ao portal; o campo
chama-se `access` em todo o código, e é o que vai para o desfecho e para o trace); `IvaDeclarationReader.readMostRecent(session, company) → {kind:"found", period,
submittedAt, replacement} | {kind:"none"}`; `PaymentDocumentFetcher.fetch(session, {period, company}) →
{kind:"document", pdf, fields: RawDocumentFields, via: "download"|"inline"|"popup"} | {kind:"no_document"} |
{kind:"already_paid"} | {kind:"not_ready"}`; `DocumentStore.put({teamId, companyId, kind, period, pdf}) →
{storagePath, bytes}`; `ObligationLedger { getCompany, getPeriod, beginPeriod (get-or-create obligation +
upsert period → in_progress), recordDocument (documents + period delivered, mesma transação), markPeriod }`;
`AttemptGuard.attemptsToday`; `PortalGate { isPaused, trip, reset }`.

O adaptador **declara** que credencial consome (`credentialProvider`); o runner resolve-a e falha
`payload_invalid` se `lookup.provider` não bater — o runner não sabe qual rota está ligada.

### 8.2 Runner `apps/worker/src/runner/iva-document-runner.ts`

Copiar `company-scan-runner.ts` e seguir esta ordem:

1. Re-hidratar trace/evento (`:63-67`).
2. `parseIvaDocumentPayload` → `payload_invalid`.
3. `gate.isPaused()` → `deferred`.
4. `ledger.getCompany` → `company_not_found` / `company_inactive`.
5. `sessions.precondition(company)` → `company_not_linked` / `company_nif_missing`.
6. Idempotência pré-browser (só com `payload.period` e `!force`).
7. `attempts.attemptsToday` → `daily_cap_reached`.
8. Credencial: `payload.credentialId ?? findFor(...)`; `load` → `*_credential_missing/invalid`.
9. Trace fallback (`correlationKey: company:<id>:iva`) + `job.started` `{jobId, teamId, companyId, attempt, access, batchId?}`.

Browser (`try`):

10. `rpa.at.session` → `sessions.open` → `markVerified`.
11. `rpa.at.iva_declaration` → `none` → skip `declaration_not_found`; comparar com `nextDuePeriod` → `declaration_not_submitted`.
12. Idempotência pós-leitura → `already_fetched`.
13. `ledger.beginPeriod(…, derivePaymentDueDate(period))`.
14. `rpa.at.payment_document` → `no_document` → `markPeriod(skipped_nonexistent)` + skip; `document` → `assertPdfIntegrity`, `assertDocumentBelongsTo(nif)` (compara **sem registar**), `normalizeDocumentFields`.
15. `integration.document_stored` → `storage.put`.
16. `integration.obligation_recorded` → `recordDocument`; `started.succeed()`, `trace.complete()`.

`catch`: `classifyFailure(err, stage)` → `{outcome, retry: !(err instanceof StructuralError), details}`;
`markByOutcome` (verify/invalidate/expire — na rota A os desfechos AT escrevem a **linha-marcador**
`integration_credentials {provider:'at', company_id, secret_encrypted:null, status:'invalid',
metadata:{source:"toconline_direct_access", invalidReason}}`, nunca a credencial TOConline);
`markPeriod(error)` se período conhecido; `started.fail({message, outcome, retry, stage})`; **trace fica
aberto se `retry && attempts < maxAttempts`** (a próxima tentativa continua-o), senão `trace.fail`.

`finally`: `session.close()`.

`jobs.result` (ok) = `IvaDocumentJobResult`; skip → `result: {reason: outcome, ...details}`; fail →
`last_error: {message, outcome, retry, stage, ...details}` (mensagem sempre texto nosso, nunca HTML do
portal).

### 8.3 Fila/loop (`job-queue.ts`, `worker-loop.ts`) — pequenas extensões compatíveis

`JobOutcome.failed.code?`, `skipped.details?`, novo `{status:"deferred", reason, untilMs}` →
`queue.defer(id, reason, until)` (`pending`, `scheduled_for=until`, **`attempts-1`**); `fail(id, {message,
...details}, {retry})`; `JobHandler.pacingMs?` (loop dorme `max(betweenJobsMs, pacingMs)`); **reaper** no
arranque e a cada N ticks: `running` com `started_at < now()-15min` → `pending` com
`last_error.outcome="interrupted"` (ou `failed` se esgotou). O scan continua a funcionar sem tocar nele.

### 8.4 Adaptadores `apps/worker/src/at/`

- `selectors.ts` — único ficheiro com seletores: `AT { loginUrl
(acesso.gov.pt/v2/loginForm?partID=DPIV&path=…), portalOrigin, paths.cc.*, paths.direct.*,
loginHostPattern, portalHostPattern, login/declarations/paymentDocument seletores marcados `TODO(recon)`,
defaultTimeoutMs }`, `TOC_DIRECT_ACCESS { summaryPath, directAccessMenu, portalFinancasItem,
switchEntityFn }`, `AtOptions` injetável (testes apontam a `127.0.0.1`), `assertAtHost`. Sem XPath ban (AT
  é server-rendered; confirmar na F0).
- `wording.ts` + `classify-page.ts` — únicos ficheiros com regexes: `classifyAtPage(snapshot) → login_form |
login_rejected{attemptsLeft} | mfa_challenge | password_change | authorization_missing | client_select |
declaration_list | declaration_none | payment_document | payment_document_none | maintenance |
server_error | unknown`; recusa exige frase afirmativa (form nu = `login_form` → retentável, como
  `session.ts:55-73`); `fingerprint(snapshot)` redigido (dígitos → `#`, sem query) para o log de `unknown`.
- `session-acesso-gov.ts` (rota B): `storageState` por `at:team:<teamId>` (CC) ou `at:company:<companyId>`;
  `tryReuse` → `goto consultar-declaracao` → `login_form`? descarta; `login()` →
  `waitForURL(portalHost)`; timeout → classificar → `AtAuthError(reason)` / `Error` retentável; **seleção de
  cliente** (CC): `listaClientesToc` + NIF → `authorization_missing`; guarda estado só depois de aterrar no
  portal; TTL 12h; `close()` = `context.close()` (um contexto por empresa).
- `session-toc-direct-access.ts` (rota A; só se a F0 a escolher): `toc.open()` →
  `page.evaluate("switchToEntityAndNotifyPages(id, cluster)")` → Sumário → Acesso Direto → Portal das
  Finanças com `context.waitForEvent("page")` → classificar popup; `close()` = fechar popup + `clearCookies`
  domínios AT + `toc.close()`. Precisa de `browser/persistent-chrome.ts`
  (`launchPersistentContext(userDataDir, {channel:"chrome", args:["--load-extension=…"]})`) + env
  `RPA_CHROME_USER_DATA_DIR`, `RPA_CHROME_EXTENSION_DIR`.
- `iva-declaration.ts`: navega `consultarDeclaracao`, lê linhas por **texto de cabeçalho** (não índice),
  `parseDeclarationRows` (pura) + `pickMostRecentDeclaration` (substituição: última submissão vence,
  `replacement:true`).
- `payment-document.ts` + `pdf-capture.ts`: navega `obterDocumentoPagamento` (preenche ano+mês/trimestre se
  pedido), classifica, lê campos do HTML (`parse-fields.ts`, pura), `capturePdf` **compete as 3
  estratégias** — `waitForEvent("download")` (exige `acceptDownloads`), `waitForResponse(content-type pdf)`,
  `waitForEvent("page")` popup + `context.request.get(url)` — e cancela as perdedoras; `page.pdf()`
  proibido (renderiza o viewer). Extração de texto do PDF (`unpdf`, opcional, `at/pdf-text.ts`) **só se** a
  F0 mostrar que os campos não vêm em HTML.
- `guards.ts`: `assertPdfIntegrity` (`%PDF-`, ≥1 KB, sem `<html`), `assertDocumentBelongsTo`,
  `assertPeriodMatches`.
- `apps/worker/src/errors.ts`: `AtAuthError extends StructuralError { reason:
rejected|blocked|expired|two_factor|authorization_missing; attemptsLeft? }`, `AtIntegrityError extends
StructuralError { outcome }`, `AtTransientError extends Error { outcome }` (**não** estrutural).
  `classifyFailure` em `runner/classify-failure.ts` (pura); teste prova `retry === !(err instanceof
StructuralError) === IVA_OUTCOMES[outcome].retry` para cada classe×etapa.
- `browser/browser.ts`: `newContext({storageState?, acceptDownloads?})`.

### 8.5 Sinks `apps/worker/src/sinks/`

- `document-store.ts` (`@supabase/supabase-js` já em deps; env `SUPABASE_URL`+`SERVICE_ROLE` já em
  `config/env.ts`): `upload(path, pdf, {contentType:"application/pdf", upsert:true})`; 5xx →
  `AtTransientError(persist_failed)`, 4xx → `StructuralError`.
- `obligation-ledger.ts` (drizzle): `beginPeriod` = `insert obligations … on conflict (company_id, kind) do
update returning id` + `insert obligation_periods … on conflict (obligation_id, period) do update
set status='in_progress' returning id`, ambos em transação com re-check `companies.team_id = $teamId`;
  `recordDocument` = upsert `documents` por `(obligation_period_id, type)` + período `delivered`, mesma
  transação; **todo `where` carrega `exists(… c.team_id = $teamId)`** através do join
  (`company-directory.ts:127-130`). **Ordem de escrita**: período `in_progress` → upload → transação
  `documents`+`delivered` (upload falhado nunca deixa `documents` a apontar para nada).
- `credential-source.ts` (estender): `load` devolve `provider`/`scope`; `findFor` (empresa antes de
  equipa); `markExpired`; `markVerified` limpa `invalidReason`.
- `attempt-guard.ts`: `sum(attempts)` de jobs do tipo por `company_id` hoje (Europe/Lisbon).
  `runner/portal-gate.ts`: `InMemoryPortalGate` (15 min).

### 8.6 Salvaguardas (rate/ética)

Serial (loop já é); `pacingMs` 5 s + jitter entre empresas (lote de 182 ≈ 30–40 min, de propósito); nunca
retentar senha rejeitada (estrutural **e** marca a credencial → as seguintes morrem na pré-condição); cap
diário por empresa (`AT_DAILY_ATTEMPT_CAP=5`); gate 15 min após `at_unavailable` (evita 182 jobs a queimar
tentativa contra portal em baixo); aviso (não bloqueio) nos dias 20–25; reuso de `storageState` da AT (um
login por sessão, não 182); `scripts/seed-at-session.ts` (login assistido headed: humano completa 2FA uma
vez, estado guardado na chave certa) — é a saída operacional se o 2FA for obrigatório.

### 8.7 `index.ts` / `env.ts`

`handlers: { [SCAN_JOB_TYPE]: runner, [IVA_DOCUMENT_JOB_TYPE]: ivaRunner }`; env novas: `AT_ACCESS_MODE`
(default `at_direct_login`), `DOCUMENTS_BUCKET=documents`, `AT_PACING_MS`, `AT_DAILY_ATTEMPT_CAP`,
`RPA_CHROME_*` (rota A). Atualizar `.env.example` (e remover a promessa do `TOC_LIVE` que não existe).

---

## 9. Web

### 9.1 Serviço `apps/web/src/lib/documents/service.ts`

- Refactors prévios: exportar `requireWriterOn` de `lib/auth.ts` (hoje privado em
  `integrations/service.ts:138-150`); `startAction` ganha `skipped(reason)` (`evt.skip` + `trace.complete`);
  `credentialRepo.update` passa a repor `status:'active'` e limpar `metadata.invalidReason` quando chega
  segredo novo (hoje não repõe — `service.ts:177-192`); `triggerSource` da credencial por provider.
- `listIvaDocuments(teamId)`: `from("iva_documents_overview").eq("team_id", teamId)` (RLS; `teamId`
  explícito por causa da armadilha do admin `service.ts:91-98`).
- `enqueueIvaFetch(companyId, requestedTeamId, {batchId?})`: `requireWriterOn` → empresa (admin client, 404
  se de outra equipa) → credencial do provider de `AT_ACCESS_MODE` → job em curso → `ivaFetchReadiness` (400
  com cópia) → ``startAction({triggerSource:"documentos.iva.fetch", type:"job.enqueued", correlationKey: `company:${id}:iva`, payload:{teamId, companyId, provider, jobType, batchId}})`` → insert `jobs {team_id, company_id, type, trace_id, triggering_event_id, payload: IvaDocumentJobPayload}`; `23505` → `act.skipped("already_running")` + devolver o job em curso → `handOff()`.
- `enqueueIvaFetchAll(requestedTeamId, {onlyMissing})`: `planBulkFetch` (pura) → trace de lote
  `job.batch_enqueued` (`correlationKey: team:<id>:iva`, contagens) → `enqueueOne` por empresa com
  concorrência 8 → `act.success()` (lote termina ao enfileirar; cada job tem o **seu** trace — um trace
  partilhado seria fechado pelo primeiro job). `export const maxDuration = 60` na action.
- Credencial AT: `getTeamCredential("at", teamId)`/`saveCredentialFromInput` já são genéricos; validar
  `username` como NIF (`validate-pt.ts`) quando `provider==="at"`.

### 9.2 Rotas e UI

- `GET /api/documents/[id]/download` (`app/api/documents/[id]/download/route.ts`): 401 sem sessão →
  `documents` via **cliente RLS** (`id, storage_path`) → 404 se invisível (cross-team, como
  `companies/service.ts:272-277`) ou sem ficheiro → `admin.storage.from("documents").createSignedUrl(path,
60)` → `logUserEvent({action:"document_downloaded", data:{documentId}})` → **302** com `Cache-Control:
private, no-store`. A URL assinada nunca entra no DOM. `?download=1` força attachment.
- `app/(dashboard)/documentos/iva/page.tsx` (force-dynamic, `requireRole("operator")`, admin `?team=` via
  novo `components/patterns/team-switcher.tsx`): `PageHeader` (ações: `FetchAllButton`), banner de
  prontidão (credencial em falta/inválida → link para `/integracoes/at` ou `/integracoes/toconline`),
  `BatchProgress` (contagens do último `batchId`, `aria-live`), `AutoRefresh active={anyInFlight}
intervalMs={5000}`, `DataTable` com colunas **Empresa** (nome + NIF; badge "Sem ligação TOConline" na rota
  A) · **Período** · **Estado** (`StatusBadge kind="ivaDocument"` + linha curta) · **Entidade / Referência /
  Valor** (`Intl.NumberFormat pt-PT EUR`; visíveis sem máscara — são instruções de pagamento que o operador
  copia para o cliente; o que se protege é nunca irem a eventos/logs/URLs) · **Prazo** (`due_date`) ·
  **Ações** (`FetchButton` "Buscar"/"Buscar novamente" desativado com `title`=motivo; link `PDF` → download
  route; `RowDetailsDialog` "Detalhes" com orientação completa, erro, tentativas, links `Ver trace`/`Editar
empresa`/credencial certa). `EmptyState` quando zero empresas.
- `FetchAllButton.tsx`: `Dialog` (primeiro uso real de `ui/dialog.tsx`) "Buscar guias de IVA de todas as
  empresas?" com contagens de `planBulkFetch`, checkbox `onlyMissing` (ignorar guias já obtidas este mês),
  `Alert` de aviso se `isPeakDay` (20–25), submit "Enfileirar {n}".
- `lib/documents/present.ts` (pura): `presentIvaRow(row, {access, credential, now})` → `{state, tone, label,
short, guidance, inFlight, readiness, canFetch, disabledReason, fetchLabel}`; `deriveState`
  (`pending→queued`, `running`, sem job→`never`, terminal→`readIvaOutcome`); `isPeakDay`.
- `lib/documents/outcomes.ts`: só `severity → tone` (`ok→success`, `wait→info/warning`, `action→destructive`,
  `support→warning`) + os 4 estados de UI; `satisfies Record<IvaRowState, …>` — drift = erro de compilação.
- `components/patterns/status-badge.tsx`: kinds `job` (mover `JOB_LABELS/TONES` de
  `integracoes/toconline/page.tsx:19-35`) e `ivaDocument`.
- `components/integrations/credential-form.tsx`: `CredentialForm` = `TocCredentialForm` generalizado por
  `provider` + `copy`; `integracoes/toconline` passa a usá-lo; nova `integracoes/at/{page,actions}.tsx`
  ("Acesso à Autoridade Tributária", `usernameLabel` "NIF do Contabilista Certificado", `provider:"at"`
  forçado no servidor).
- `nav-config.ts`: `{ "Guias de IVA", "/documentos/iva", FileText }` após Empresas; `{ "Autoridade
Tributária", "/integracoes/at", Landmark }` após TOConline. `(dashboard)/page.tsx`: linha AT liga a
  `/integracoes/at`.
- `/empresas`: `COLUMNS` += `toconline_company_id, toconline_cluster, toconline_synced_at`; coluna
  "TOConline" (Ligada/Não ligada).
- `lib/documents/access.ts`: `getAtAccessMode()` ← `AT_ACCESS_MODE` (mesma env do worker) — a rota lê-se
  num só sítio.

---

## 10. Observabilidade

Um trace por job (o lote é `batchId` + trace próprio `job.batch_enqueued`). `correlationKey`
`company:<uuid>:iva` (período desconhecido ao enfileirar) e `team:<uuid>:iva` (lote) — documentar as duas em
`docs/event-logging.md:43`. Cadeia do worker (filhos de `job.started`): `rpa.at.session` →
(`rpa.toconline.direct_access` na rota A) → `rpa.at.iva_declaration` → `rpa.at.payment_document` →
`integration.document_stored` → `integration.obligation_recorded`; `skip(outcome)` para estados válidos,
`fail({message, outcome, retry, stage})` para falhas; novo `user.document_downloaded` no web. Proibido em
payload/log/mensagem: NIF, nome, entidade, referência, valor, senha, código SMS, texto cru do portal (teste
"selo RGPD" no runner, como `company-scan-runner.test.ts:472-486`).

---

## 11. Fase 0 — Reconhecimento (o portão)

Sem isto os seletores e as redações da AT são palpites (o Módulo 0 fez o mesmo: `selectors.ts:2-3`
"observados no reconhecimento de 2026-08-16"). **Precisa de credenciais reais e de você (ou o gabinete) a
acompanhar**; nada é gravado fora da máquina.

- `apps/worker/scripts/recon-at.ts`: headed, `slowMo`, `page.pause()` entre etapas; credenciais só por env
  (`AT_RECON_USER/PASSWORD` ou `TOCONLINE_USER/PASSWORD`), nunca argv/BD; regista em
  `apps/worker/recon/<data>/` (git-ignored): screenshots, `fingerprint.json` (dígitos mascarados),
  `forms.json` (nomes/tipos de campos, sem valores), `network.jsonl` (content-type/disposition, URL sem
  query), `pages.jsonl` (popups).
- Percurso a observar em **ambas as rotas**: login (redação de erro real; 2FA?; troca de senha?) → seleção
  de cliente (`listaClientesToc` na B; `switchToEntityAndNotifyPages` + Sumário → Acesso Direto na A) →
  `consultar-declaracao` (colunas, formato do período, declarações de substituição, "sem declarações") →
  `obter-doc-pagamento` (pede ano+período? campos entidade/referência/valor em **HTML**? entrega por
  **download / inline / popup**? redação de "sem documento"/"já pago"?) → comparar headed vs headless.
- Entregáveis (commitados em `docs/superpowers/specs/2026-09-xx-at-recon.md`): tabela de seletores, tabela
  de redações → regex, tabela de entrega do PDF, notas de fluxo (2FA, TTL de sessão, host de aterragem), e
  **go/no-go A vs B com a razão**. Só depois se substituem os `TODO(recon)` em
  `selectors.ts`/`wording.ts`.
- Verificar com o gabinete/OCC: subconta é isenta de 2FA? o CC tem autorização/nomeação para todos os
  clientes? Acesso Direto ainda funciona pós-2FA?
- Corrigir `project-context.md` (§3, achado 4).

---

## 12. Fases de implementação (TDD red → green; cada fase termina com `pnpm lint && pnpm typecheck && pnpm test` verdes)

**F1 — Spec + contrato de domínio (sem BD, sem browser)**

1. Escrever `docs/superpowers/specs/2026-09-03-modulo-1-iva-guia-design.md` a partir deste plano (regra do
   CLAUDE.md).
2. `packages/core/src/domain/at/*` com testes em
   `packages/core/test/at-{outcomes,period,due-date,document-fields,credential-select,readiness}.test.ts` —
   inclui completude (`Object.keys(IVA_OUTCOMES)` = `IVA_OUTCOME_CODES`), "auth nunca retenta",
   `parsePeriod` total, `derivePaymentDueDate` (fev; jun→set; 25/04/2026 sábado+feriado → 27/04; Corpo de
   Deus por computus), `normalizeDocumentFields` sem valores nas ressalvas.

**F2 — Base de dados + Storage**

3. Smoke tests vermelhos em `packages/db/test/iva-documents.smoke.test.ts` (unique parcial de jobs, uniques, view só devolve a própria equipa, view devolve `job_outcome` de job inserido com a constante, bucket privado, `authenticated` não lê `storage.objects`).
4. Schema Drizzle → `pnpm db:generate` → `_iva_documents_rls.sql` → `config.toml` → `seed.sql` → `pnpm db:reset` → verdes.

**F3 — Worker (tudo contra fixtures locais; nada depende da F0 até o passo 9)**

5. `errors.ts` + `classify-failure.ts` + ports + `job-queue`/`worker-loop` (`defer`, `code`, `pacingMs`, reaper) + `portal-gate.ts` — testes puros/DB.
6. `iva-document-runner.ts` com fakes: **um `it` por linha de §5** (desfecho, período escrito, marcação de credencial, sessão fechada, trace fechado/aberto), saídas antecipadas fecham o trace do dashboard, `IVA_RESULT_KEYS`, selo RGPD.
7. `at/{wording,classify-page,parse-declarations,parse-fields,guards}.ts` — puros.
8. Sinks (`document-store`, `obligation-ledger`, `credential-source` estendido, `attempt-guard`) — DB tests incl. "escrita cross-team é no-op" e upload/download no bucket local.
9. Rota B em browser: `test/at/fixture-server.ts` (login boa/errada+contador/2fa/expirada/avaria; `listaClientesToc` com NIF sem autorização; `consultar-declaracao` com 3 linhas incl. substituição e variante "sem declarações"; `obter-doc-pagamento?mode=attachment|inline|popup|none`; PDF gerado em `beforeAll` com `page.pdf()`), `session-acesso-gov`, `iva-declaration`, `payment-document`/`pdf-capture` (3 modos devolvem os mesmos bytes), `browser.ts` `acceptDownloads`.
10. `scripts/recon-at.ts` + `scripts/seed-at-session.ts`; `index.ts`/`env.ts` wiring.

**F4 — Web**

11. Refactors (`requireWriterOn`, `startAction.skipped`, reposição de `status` ao guardar credencial); `apps/web/vitest.config.ts` + `test:unit` (+ passo no `ci.yml`); testes de `present.ts`/`outcomes.ts`.
12. `lib/documents/service.ts` + `documentos/iva/{page,actions,FetchButton}` mínimos; e2e `documentos-iva.spec.ts` (3) por linha → "Na fila"; segundo clique → "Já existe uma busca em curso" (determinístico: sem worker no e2e, como `integracoes-toconline.spec.ts:60-63`).
13. Download route + e2e (401 / 302 com `Location` assinada para a própria equipa via `request` com `maxRedirects:0` / 404 cross-team como **operator** / 404 sem ficheiro; DOM nunca contém `/storage/v1/`, `token=` nem o prefixo do caminho). PDF de teste carregado em `beforeAll` com service role (skip se a chave faltar).
14. `CredentialForm` + `/integracoes/at` + nav + e2e (senha nunca volta ao DOM; spec do TOConline continua verde).
15. Listagem completa (`StatusBadge` kinds, `RowDetailsDialog`, `FetchAllButton` com Dialog e aviso 20–25, `BatchProgress`, banner de prontidão, `TeamSwitcher`, empty state) + e2e (vazio; listagem com seed; lote → contagens).
16. `/empresas` coluna TOConline.

**F5 — Fase 0 (reconhecimento) e fecho**

17. Correr `recon-at.ts` nas duas rotas com credenciais reais (headed, acompanhado); produzir `at-recon.md`; decidir rota; preencher `selectors.ts`/`wording.ts`; rerodar F3.7 e F3.9 com as redações reais.
18. Se a F0 escolher a rota A: `browser/persistent-chrome.ts` + `at/session-toc-direct-access.ts` (+ teste com `TocSessionFactory` falso e fixture que faz `window.open`) e smoke `AT_LIVE=1`.
19. Ensaio real assistido: 1 empresa → verificar `jobs`, `obligation_periods`, `documents`, objeto no bucket, PDF abre pelo dashboard, trace completo em `/logs`; depois lote pequeno (5) fora dos dias 20–25.
20. Docs: `docs/database.md` (documentos/Storage/view/uniques + corrigir claims obsoletos: `niss` global, cifra "planejada", obligations "leitura ampla"), `docs/architecture.md` (download route, Storage, fluxo Módulo 1), `docs/event-logging.md` (novos tipos + 2 formas de `correlationKey`), `project-context.md` (prazos/regimes), `apps/worker/README.md`, `.env.example`; `graphify update .`.

---

## 13. Verificação end-to-end

- `pnpm test` da raiz com `.env` carregado (`set -a && . ./.env && set +a`): core (contrato + calendário),
  db (constraints, view, bucket), worker (runner por caso, browser contra fixtures, sinks), web e2e
  (listagem, enfileirar, lote, download, credencial AT).
- Manual local (sem AT real): `/documentos/iva` → "Buscar" numa empresa ligada → badge "Na fila" → worker
  (com `AT_ACCESS_MODE=at_direct_login` e sem credencial AT) → linha vira "Senha da AT por configurar" com
  orientação e link → `/integracoes/at` guardar → "Buscar novamente" → worker tenta login (contra fixture
  ou real na F0).
- Real (F5.19): guia de uma empresa aparece com entidade/referência/valor, `PDF` abre em nova aba via 302,
  `Ver trace` mostra `job.enqueued → job.started → rpa.at.* → integration.*` num só trace; caso "IVA a
  recuperar" mostra "Sem imposto a pagar"; senha errada de propósito (uma vez, com contador ≥ 3) mostra
  "Senha da AT rejeitada" e **as empresas seguintes do lote não tocam o portal**.

---

## 14. Riscos e incógnitas (abertas até à F0)

| Risco                                                   | Mitigação no desenho                                                                                                                            |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Rota /cc/ não cobre todos os clientes ou exige nomeação | `at_authorization_missing` por empresa; fallback rota A ou credencial por empresa (subconta) — o `AtSessionFactory` já suporta `scope: company` |
| 2FA obrigatório sem isenção para subcontas              | `seed-at-session.ts` (login assistido, estado reutilizado); `at_2fa_required` expira a credencial para o lote parar cedo                        |
| Extensão TOConline Connect só em Chrome headed          | `PersistentChromeBrowser` isolado; rota B não precisa de nada disto                                                                             |
| Campos não vêm em HTML                                  | `unpdf` atrás de `PdfTextExtractor` opcional; `fetched_without_fields` mantém o PDF útil                                                        |
| Literal do tipo de job na view SQL                      | smoke test com a constante importada                                                                                                            |
| Lote de 182 na Vercel                                   | concorrência 8 + `maxDuration=60`; upgrade futuro: transação única em Drizzle                                                                   |
| Portal lento nos dias 20–25                             | gate 15 min + `deferred` sem gastar tentativa + aviso na UI                                                                                     |
| Trace aberto para sempre se o worker morrer             | reaper → `interrupted` (retentável)                                                                                                             |

---

## 15. Fora de escopo (explícito)

Envio por e-mail/WhatsApp, lembretes de atraso, IRS/DMR/Segurança Social (entram pelo mesmo molde: novo
`kind`, novo adaptador em `at/` ou `ss/`, mesma listagem), agendamento automático (`trigger_kind: schedule`
existe, o scheduler não), pool de browsers/concorrência > 1.
