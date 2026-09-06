# Módulo 1 — Rota A: guia do IVA via **Acesso Direto do TOConline** (extensão TOConline Connect) — Design

- **Data:** 2026-09-06
- **Branch:** `feat/modulo-1-rota-a-toconline-acesso-direto`
- **Autor:** brainstorming com o utilizador
- **Spec de origem:** `2026-09-03-modulo-1-iva-guia-design.md` (§3.1, §5.3, §8.4 "rota A", §12 F5.18)
- **Estado:** aprovado — fonte para a implementação

---

## 1. Objetivo

O Módulo 1 está mergeado e completo pela **rota B** (`at_direct_login`: o worker entra no Portal das Finanças
com a credencial do Contabilista Certificado via `acesso.gov.pt`), mas essa rota nunca foi validada contra o
portal real. Este trabalho acrescenta, **em paralelo e sem tirar a rota B**, a **rota A**: o worker entra no
TOConline com a credencial do gabinete, "veste" a empresa e usa o **Acesso Direto → Portal das Finanças**, que
abre a AT já autenticada no perfil da empresa com a senha que o TOConline guarda (nunca visível para nós). A rota A
exige a extensão Chrome **TOConline Connect**, e é ela que se usa.

**Definição de entregue:** como operador, num botão, o sistema percorre os clientes **em fila, um a um**, entra na
AT pelo Acesso Direto do TOConline, guarda a guia se existir e **avisa** quando não existe ou quando o acesso não
foi possível — com o motivo e o que fazer.

---

## 2. Decisões fechadas com o utilizador

| Decisão | Escolha |
|---|---|
| Onde corre o worker na rota A | **Neste Mac** (headed na Fase 0; headless depois). Servidor Linux fora de escopo. |
| Como o operador escolhe a rota | **Botões separados por rota**: «Buscar»/«Buscar todas» = rota B (inalterados); **«Buscar via TOConline»/«Buscar todas via TOConline»** = rota A. A listagem mostra por que rota correu a última tentativa. |
| Estado do Acesso Direto no gabinete | Senhas da AT gravadas no TOConline, **nunca testado** → Fase 0 da rota A obrigatória e acompanhada. |
| Browser que hospeda a extensão | **Chromium do Playwright** (`launchPersistentContext` + `channel: "chromium"` + extensão descompactada). Rejeitados: ligar ao Chrome real por CDP (só headed, frágil); emular a extensão (não usa a extensão; a senha passaria pelo nosso processo). |
| Rota por pedido, não por env | `AT_ACCESS_MODE` **desaparece** dos dois deployables; o worker regista **as duas** fábricas de sessão e escolhe por `payload.access`. |

---

## 3. Achados que moldam o desenho

1. **A extensão TOConline Connect** (id `lbcpogheaekofocmhfbidfkimgkfenkp`, v2.1, MV3) está instalada no Chrome
   deste Mac. Lido o código: o *content script* (só em `https://*.toconline.pt/*`) faz relay de
   `window.postMessage` com `type === btoa("platform")` para o *background*, que trata
   `action: "login-fetch-logout"`: `fetch` de **logout** no portal → `chrome.tabs.create({url})` para a página de
   login → guião declarativo por XPath (`input-value` com a senha, `form-submit`, `follow` com `expectURL`,
   `closeTab`, `resolve`). Consequências:
   - o separador da AT aparece ao Playwright como **`page` novo no mesmo contexto** (`context.waitForEvent("page")`);
   - a extensão **faz logout antes de cada login** → empresas seguidas no mesmo perfil são seguras; ainda assim
     limpamos cookies da AT no `close()`;
   - a senha da AT passa em claro no `postMessage` da página. **Regra:** o nosso código nunca escuta, regista ou
     serializa mensagens `cGxhdGZvcm0=`; o reconhecimento regista só nomes de `action`, nunca `payload`;
   - o `manifest.json` tem `key` → o id mantém-se quando carregada descompactada; a pasta `_metadata/` **tem de ser
     removida** na cópia (o Chrome recusa carregar descompactadas com nomes `_*`).
2. **Chrome 137+ removeu `--load-extension` nas builds de marca** (o Mac tem o 152). A spec original assumia
   `channel: "chrome"`; já não funciona. O Playwright manda usar o **Chromium bundled (`channel: "chromium"`)**,
   que carrega extensões inclusive em headless novo. `playwright ^1.62.1` tem `clearCookies({domain: RegExp})` e
   `context.serviceWorkers()`.
3. A extensão só corre em `*.toconline.pt` → os testes de browser usam uma **extensão-fixture nossa** com o mesmo
   protocolo contra servidores locais (`test/at/fixture-server.ts` para a AT; fixture novo do TOConline).
4. O *service worker* MV3 da extensão **adormece** (~30 s) → `context.serviceWorkers()` não prova presença depois
   do arranque. Verifica-se uma vez no arranque (`waitForEvent("serviceworker")`); depois é a página do TOConline
   ("Instalar Extensão Chrome") que diz "extensão em falta".

---

## 4. Arquitetura

```
dashboard /documentos/iva                              worker (serial, pacing 5 s + jitter)
  «Buscar via TOConline» (linha) ─┐                     WorkerLoop → JobQueue.claimNext("rpa.fetch_iva_document")
  «Buscar todas via TOConline» ──┴► enqueueIvaFetch(       └ IvaDocumentRunner.run(job)
      companyId, teamId, {access:"toconline_direct_access"})   ├ pré-condições sem browser (iguais às da rota B)
      └ jobs.payload.access = "toconline_direct_access"        ├ sessions = registry.find(s => s.access === payload.access)
                                                               ├ TocDirectAccessAtSessions.open()
  «Buscar» / «Buscar todas» → access:"at_direct_login"          │   PersistentChromiumBrowser (1 por processo, extensão carregada)
                                                               │   1. TOConline: reutiliza sessão do perfil ou faz login (credencial `toconline` da equipa)
  view iva_documents_overview + job_access                      │   2. switchToEntityAndNotifyPages(tocCompanyId, cluster) → /summary
  linha mostra «via TOConline» | «login direto na AT»           │   3. Acesso Direto → Portal das Finanças + context.waitForEvent("page")
                                                               │   4. no tab novo: waitForURL(host do portal) | classificar (rejeitada/2FA/…)
                                                               │   5. guarda NIF (at_session_mismatch) → AuthenticatedAtSession{page, access, urls: paths.direct}
                                                               ├ AtIvaDeclarationReader / AtPaymentDocumentFetcher / Storage / Ledger (inalterados)
                                                               └ close(): fecha tabs da AT + clearCookies(AT); a tab do TOConline fica para a empresa seguinte
```

**Ciclo por empresa:** sessão TOConline partilhada pelo lote (um login) → impersonation → Acesso Direto → login
feito pela extensão → leitura/captura com o código existente → logout implícito (extensão) + limpeza de cookies.

Desfechos que passam a ser lançados de verdade (já existiam em `IVA_OUTCOMES`): `direct_access_extension_missing`
(estrutural), `direct_access_not_configured` (skip + marcador `senha_nao_configurada`), `direct_access_failed`
(retentável), além de `toconline_*` e de todos os `at_*` já classificados por `classifyFailure`.

---

## 5. Worker

### 5.1 Browser persistente — `apps/worker/src/browser/persistent-chromium.ts`

`PersistentChromiumBrowser` (`PersistentContextProvider`, **não** `BrowserProvider`: um perfil persistente tem um
contexto só): `launchPersistentContext(userDataDir, { channel: "chromium", headless, acceptDownloads: true, viewport
1600×1000, locale: "pt-PT", args: ["--disable-extensions-except=<ext>", "--load-extension=<ext>"] })` à primeira
utilização; `installKeepNamesShim`; `context()`; `extension()` → `{ id, version } | null` (espera `serviceworker`
até 10 s no arranque e guarda o id); `close()`. Perfil com `mode 0o700`.

### 5.2 Extensão portátil — `apps/worker/scripts/install-toconline-connect.ts`

Procura a extensão nos perfis do Chrome (macOS/Linux/Windows), copia a versão mais recente para
`RPA_CHROME_EXTENSION_DIR` (default `.rpa/extensions/toconline-connect`), remove `_metadata/`, valida o
`manifest.json`. Fallback: descarrega o CRX3 do update URL da Web Store, salta o cabeçalho (`Cr24` + versão +
tamanho) e descompacta com `unzip`. O código da extensão nunca é commitado (`.rpa/` é git-ignored).

### 5.3 Adaptador — `apps/worker/src/at/session-toc-direct-access.ts`

`TocDirectAccessAtSessions implements AtSessionFactory` — `access = "toconline_direct_access"`,
`credentialProvider = "toconline"`; `precondition`: `tocCompanyId`+`tocCluster` senão `company_not_linked`;
`open({company, credentials, log?})`:

1. `persistent.context()`; `extension() === null` → `AtIntegrityError("direct_access_extension_missing")`.
2. Tab do TOConline (reutilizada entre jobs; recriada se fechada): `goto TOCONLINE.loginUrl`; se ficou em `/login`
   → `loginOnPage` (extraído de `PlaywrightTocSessions` para `toconline/login.ts`); o perfil persistente **é** o
   storageState; `reused` = não fez login; `origin` derivado do URL (host shardado).
3. `page.evaluate` de `TOC_DIRECT_ACCESS.switchEntityFn(id, cluster)` (argumentos em array, nunca string
   interpolada) → `goto origin + summaryPath` → `classifyDirectAccessPage` (`at/direct-access-wording.ts`, único
   ficheiro com regexes do TOConline desta rota): `extension_missing` → estrutural; `password_not_configured` →
   `AtIntegrityError("direct_access_not_configured")`; `unknown` → `StructuralError` (etapa `direct_access` →
   `toconline_unexpected_page`).
4. `context.waitForEvent("page")` armado **antes** de clicar `directAccessMenu` → `portalFinancasItem`; timeout sem
   tab → `AtTransientError("direct_access_failed")`; todas as páginas abertas a partir daqui ficam registadas.
5. No tab novo: `waitForURL(host ∈ AT.portalHostPattern)`; timeout → `loginErrorFrom(snapshot)`
   (`at/login-errors.ts`, extraído de `session-acesso-gov.ts` e partilhado pelas duas rotas: rejeitada com
   `attemptsLeft`, 2FA, expirada, bloqueada, 5xx…); tab fechado pela extensão → `direct_access_failed`;
   `assertAtHost`; `assertSessionBelongsTo(texto, company.nif)` (movido para `at/guards.ts`).
6. Devolve `AuthenticatedAtSession { page, access, urls: AT.portalOrigin + AT.paths.direct.*, host, close }`;
   `close()` fecha as páginas abertas desde o passo 4 e
   `context.clearCookies({ domain: /(^|\.)(portaldasfinancas\.gov\.pt|acesso\.gov\.pt)$/ })`; a tab do TOConline não
   fecha.

Ports: `AtSessionFactory.open()` ganha `log?: { info; warn }` (o runner passa `sessionEvent.log`; nunca PII).

### 5.4 Runner, env e wiring

- `IvaRunnerDeps.sessions: readonly AtSessionFactory[]`; o runner escolhe `find(s => s.access === payload.access)`;
  ausente → `payload_invalid` "Modo de acesso não suportado por este worker."; emite `rpa.toconline.direct_access`
  como filho de `rpa.at.session` na rota A.
- `env.ts`: sai `AT_ACCESS_MODE`; `RPA_CHROME_USER_DATA_DIR` default `.rpa/chromium-profile`;
  `RPA_CHROME_EXTENSION_DIR` default `.rpa/extensions/toconline-connect`.
- `index.ts`: regista `[AcessoGovAtSessions, TocDirectAccessAtSessions]`; o browser persistente arranca só no
  primeiro job da rota A; `shutdown` fecha os dois browsers.

### 5.5 Testes

- Puros: parser do cabeçalho CRX3 e escolha de versão; `classifyDirectAccessPage` com armadilhas; runner com
  registo de fábricas (rota sem fábrica → `payload_invalid`; cada job vai à sua; `log` chega ao `open()`; selo RGPD).
- Browser (`*.browser.test.ts`, `SKIP_BROWSER_TESTS=1` salta): `test/fixtures/connect-extension/` (extensão-fixture
  MV3 com o mesmo handshake e `login-fetch-logout`), `test/at/toc-fixture-server.ts` (mini-TOConline com `/login`,
  `/companies`, `/summary`, `switchToEntityAndNotifyPages`, menu Acesso Direto e knobs `extensionMissing`,
  `passwordNotConfigured`, `closeTabAfterLogin`, `noTab`), `session-toc-direct-access.browser.test.ts` (um `it` por
  desfecho de §5.3/§5.4 da spec original), `persistent-chromium.browser.test.ts`, caso da rota A em
  `payment-document.browser.test.ts`, e `extension-presence.browser.test.ts` (opcional, extensão real).

---

## 6. Web, core e BD — rota escolhida por pedido

- **BD:** migration à mão `<ts>_iva_view_job_access_rls.sql` recria `iva_documents_overview` com a coluna final
  `j.payload->>'access' as job_access` (smoke test primeiro).
- **`present.ts`:** `presentIvaRow(row)` fica independente da rota (ganha `lastAccess`); novo
  `fetchAffordance(row, {access, credential})` / `fetchAffordances(row, credentialFor) → Record<AtAccessMode, …>`;
  `fetchButtonLabel` ("Buscar" | "Buscar novamente" | "Buscar via TOConline" | "Buscar novamente via TOConline");
  `ACCESS_LABEL`/`accessHint`; `BULK_COPY[access]`; `credentialLinkFor(outcome, lastAccess)`.
- **`bulk.ts`:** `accessFromForm` (desconhecido/ausente = `at_direct_login`).
- **`service.ts`:** sai `getAtAccessMode`; `enqueueIvaFetch(companyId, teamId, { access, batchId?, force? })`,
  `enqueueIvaFetchAll(teamId, { access, onlyMissing })`; `OVERVIEW_COLUMNS` += `job_access`. Idempotência
  inalterada: um job em curso por empresa, independente da rota.
- **UI:** `FetchButton` com `FetchAffordance` + campo escondido `access` + `refetch` explícito; `FetchAllButton`
  por `access`; `RowDetailsDialog.fetch: Record<AtAccessMode, …>`; `page.tsx` com dois botões por linha, dois no
  header, um `credentialBanner` por rota, dica da rota ao lado do estado. Apagar `lib/documents/access.ts` e o alerta
  de `integracoes/at` que dependia do modo.
- **e2e:** sem skip por `AT_ACCESS_MODE`; `exact: true` nos botões; testes novos da rota A.
- `packages/core` não muda.

---

## 7. Observabilidade

Um trace por job (inalterado). Cadeia na rota A: `job.enqueued → job.started → rpa.at.session →
rpa.toconline.direct_access → rpa.at.iva_declaration → rpa.at.payment_document → integration.document_stored →
integration.obligation_recorded`. Proibido em payload/log/mensagem: NIF, nome, senha, texto cru do portal,
qualquer `postMessage` do TOConline.

---

## 8. Fase 0 — reconhecimento da rota A (o portão)

`recon-at.ts --route a` passa a usar o browser persistente (channel `chromium`, headed). Observar com o utilizador
ao lado, com uma empresa, fora dos dias 20–25: deteção da extensão pelo TOConline; redação quando a senha da AT não
está gravada; diálogos antes de abrir; aterragem (`acesso.gov.pt` → portal?); **2FA?**; host; caminhos diretos
`consultar-declaracao`/`obter-doc-pagamento`; entrega do PDF; `closeTab`; nome real da função de troca de empresa e
seletores do menu. Entregável: `docs/superpowers/specs/2026-09-xx-at-recon.md` com go/no-go. Só depois se
substituem os `TODO(recon)` em `selectors.ts`/`wording.ts`/`direct-access-wording.ts`.

> Se a AT pedir SMS no login da empresa via Acesso Direto, a rota A não é automatizável sem intervenção:
> `at_2fa_required` + marcador `2fa_exigido` param o lote cedo. Reportar e decidir.

---

## 9. Fases de implementação

**F0** spec + branch + extensão portátil + browser persistente + env · **F1** reconhecimento (acompanhado) ·
**F2** adaptador da rota A + registo de fábricas + testes de browser com extensão-fixture · **F3** web/core/BD ·
**F4** ensaio real assistido, docs, `graphify update .`. Cada fase termina com `pnpm lint && pnpm typecheck &&
pnpm test` verdes.

---

## 10. Riscos

| Risco | Mitigação |
|---|---|
| AT pede 2FA via Acesso Direto | `at_2fa_required` + marcador para o lote parar cedo; decisão com o gabinete |
| Headless novo ≠ headed com extensão | Fase 0 compara os dois; testes correm nos dois modos |
| TOConline muda menu/protocolo | Seletores/redações num só sítio; falha alta e estrutural |
| Tab da AT fechado pela extensão | `page.on("close")` → `direct_access_failed`; Fase 0 confirma o guião |
| Cookies da AT entre empresas | logout da extensão + `clearCookies` por domínio + guarda `at_session_mismatch` |
| Web em produção antes do worker | job da rota A fecha como `payload_invalid` legível; deploy worker-primeiro |

---

## 11. Fora de escopo

Fallback automático entre rotas; envio por e-mail/WhatsApp; outros impostos; agendamento; pool de browsers;
worker em servidor Linux (o desenho permite; não se valida agora).
