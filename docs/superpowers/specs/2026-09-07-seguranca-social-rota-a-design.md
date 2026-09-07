# Segurança Social pela rota A (Acesso Direto do TOConline) — 2026-09-07

**Estado:** worker implementado contra fixtures; **Fase 0 na SSD real por fazer** (com o
operador presente). Tudo em `apps/worker/src/ss/selectors.ts` é `TODO(recon)`.

## O que o gabinete pediu

1. No TOConline, Acesso Direto → entidade «Segurança Social» → SSD aberta no perfil do cliente.
2. Na SSD: Pagamentos e Dívidas → Valores a pagar à Segurança Social → Pagamentos → Fazer pagamento.
3. Marcar «pedir para atuar em nome próprio».
4. Aparece o valor → Pagar → Multibanco → descarregar o PDF e guardá-lo para o email.

## Desenho

- **Sessão** (`src/ss/session-toc-direct-access.ts`): `TocDirectAccessSsSessions` é a mesma
  classe da rota A da AT com outro `DirectAccessPortal` (entidade do cofre, chave
  `vault.accesses.company.SS`, host `app.seg-social.pt`, cookies `seg-social.pt`, guarda de
  pertença por NIF quando a página o mostra). A senha da SS nunca passa pelo worker.
- **Documento** (`src/ss/payment-document.ts`): `SsPaymentDocumentFetcher.fetch(session)` percorre
  a SSD **por texto** (`getByRole`/`getByText` com as regexes de `selectors.ts`), marca a opção
  de representação se existir, lê o valor (ou devolve `nothing_to_pay`), escolhe Multibanco,
  tolera uma confirmação intermédia e captura o PDF com a corrida de `at/pdf-capture.ts`
  (download / inline / popup). Cada passo deixa um marco no `SessionLog`.
- **Desfechos**: `document` (PDF + entidade/referência/valor), `nothing_to_pay`, e
  `AtIntegrityError("at_unexpected_page")` com a assinatura da página quando um menu não existe.
- **Demonstração / Fase 0**: `scripts/ss-demo.ts` (headed, uma empresa, PDF em `.rpa/out/`).

## Fora deste passo (próximos)

- Tipo de job próprio, ledger/período e Storage (`documents.kind = "ss"`), runner e botão no dashboard.
- Guarda de pertença por NISS (a SSD identifica o titular pelo NISS, que não está na BD).
- Corrigir `selectors.ts`/`wording` com o que a Fase 0 mostrar e registar aqui a tabela observada.

## Fase 0 — observado na SSD real (2026-09-07)

Corrido pela demo/recon com o operador, empresa de teste «FRIENDLY CLICONTA» (tocCompanyId 72075).

- **Aterragem:** o Acesso Direto abre a SSD em `www.seg-social.pt` (não `app.`), portal
  **PrimeFaces/JSF** server-rendered (`/ptss/pssd/...`). Login e portal partilham o host, por isso
  `landed()` espera o caminho deixar de ser o de login (`loginPathPattern`).
- **Percurso confirmado:**
  `/ptss/pssd/menu/pagamentos-dividas` → cartão «Valores a pagar à Segurança Social»
  (`/…/valores-a-pagar`) → cartão «Pagamentos» (`/…/valores-a-pagar/pagamentos`) →
  «Fazer pagamentos» → wizard `/ptss/ci/canais-pagamento/seleciona-pacote`.
  As redações dos menus e o «Não existem valores a pagar neste momento» batem certo com `selectors.ts`.
- **Sem valor a pagar hoje:** a empresa de teste não tinha nada a pagar, por isso o wizard mostrou
  «Não existem valores a pagar» e o fluxo devolveu `nothing_to_pay` — corretamente. **Não foi possível
  observar** a página com valor: a opção «atuar em nome próprio», o montante, o Multibanco e o botão do
  documento continuam `TODO(recon)`, à espera de uma empresa com imposto em aberto (ou do próximo ciclo).
- **JSF com estado:** o wizard `/ci/…` só se alcança por **cliques** a partir do menu; um `goto` direto
  cai num modal «Prolongar sessão». O fetcher já navega por cliques.
- **Robustez do TOConline:** uma sessão TOConline **velha** no perfil persistente prende a «Validação
  de sessão em curso»; um só reload não a solta. A sessão passou a **escalar**: se o reload falhar,
  limpa as cookies do TOConline e volta a entrar (a causa dos «TOConline não ficou pronto» na demo).
- **1.º clique na entidade falha, 2.º resulta:** confirmado ao vivo (como na AT). O retry de duas
  tentativas do Acesso Direto cobre-o. Também se corrigiu um «Execution context was destroyed» ao
  fotografar a página a meio da navegação do login da extensão (`fotografarAssente`).
