/**
 * O ÚNICO ficheiro com seletores, caminhos e redações da **Segurança Social
 * Direta** (SSD) — o mesmo papel que `src/at/selectors.ts` tem para a AT.
 *
 * Tudo aqui é `TODO(recon)`: palpite informado sobre a SSD real, à espera da
 * Fase 0 com credenciais reais (feita com o operador presente, como na AT).
 * Por isso os seletores são **por texto** (`getByRole`/`getByText` com regex)
 * e não por `id`/classe: sobrevivem a uma reestruturação de HTML e falham
 * alto quando a redação muda — nunca em silêncio.
 *
 * O percurso pedido pelo gabinete (2026-09-07):
 *   Pagamentos e Dívidas → Valores a pagar à Segurança Social → Pagamentos →
 *   Fazer pagamento → [x] pedir para atuar em nome próprio → (valor) → Pagar →
 *   Multibanco → PDF com a referência.
 */
export const SS = {
  /** Origem da SSD. Observado: o Acesso Direto aterra em `www.seg-social.pt`. */
  portalOrigin: "https://www.seg-social.pt",
  /** Hosts aceites depois de autenticar. O `$` trava `…seg-social.pt.evil.com`. */
  portalHostPattern: /^(app|www)\.seg-social\.pt$/,
  /** Domínios de cookie da SS — o que a rota A limpa entre empresas. */
  cookieDomainPattern: /(^|\.)seg-social\.pt$/,
  /** Caminhos do login (SSO) no mesmo host do portal: enquanto lá estiver, não aterrou. */
  loginPathPattern: /\/sso\/|login|autentica/i,

  // Confirmado na SSD real em 2026-09-07 (www.seg-social.pt, PrimeFaces/JSF):
  //   /ptss/pssd/menu/pagamentos-dividas
  //   → cartão «Valores a pagar à Segurança Social» (/…/valores-a-pagar)
  //   → cartão «Pagamentos» (/…/valores-a-pagar/pagamentos)
  //   → «Fazer pagamentos» (/ptss/ci/canais-pagamento/seleciona-pacote, wizard JSF)
  // As redações dos menus, o host e o «não existem valores a pagar» batem certo.
  // O que fica TODO(recon): a página COM valor a pagar (a empresa de teste não
  // tinha nada a pagar em 2026-09-07), logo a opção «atuar em nome próprio», o
  // valor, o Multibanco e o botão do documento continuam por observar.
  menu: {
    /** Menu de topo/lateral da SSD. */
    pagamentosEDividas: /pagamentos\s+e\s+d[ií]vidas/i,
    /** Submenu / cartão dentro de «Pagamentos e Dívidas». */
    valoresAPagar: /valores\s+a\s+pagar\s+[àa]\s+seguran[çc]a\s+social/i,
    /** Cartão «Pagamentos» dentro de «Valores a pagar» (/…/valores-a-pagar/pagamentos). */
    pagamentos: /^\s*pagamentos\s*$/i,
    /** Ação «Fazer pagamentos» → wizard /ptss/ci/canais-pagamento/seleciona-pacote. */
    fazerPagamento: /fazer\s+pagamento/i,
  },
  pagamento: {
    /** A opção «pedir para atuar em nome próprio» (representação). */
    atuarEmNomeProprio: /atuar\s+em\s+nome\s+pr[óo]prio/i,
    /** Botão «Pagar» que leva à escolha do meio de pagamento. */
    pagar: /^\s*pagar\s*$/i,
    /** Meio de pagamento «Multibanco» (referência de pagamento). */
    multibanco: /multibanco/i,
    /** Botão que emite/descarrega o documento de pagamento. */
    documento:
      /(?:obter|descarregar|imprimir|gerar|guardar|download)[^.]{0,30}(?:documento|pdf|refer[êe]ncia|comprovativo)|documento\s+de\s+pagamento/i,
    /** O contentor de onde se lêem entidade/referência/valor antes do clique. */
    fieldsContainer: "main, #content, body",
  },
  wording: {
    /**
     * Não há nada a pagar: estado normal do mês, não uma falha. A frase real
     * observada em 2026-09-07 foi «Não existem valores a pagar neste momento».
     */
    nothingToPay:
      /n[ãa]o\s+existem\s+valores\s+a\s+pagar|n[ãa]o\s+(?:existem|h[áa]|tem)\s+(?:valores|montantes|d[ií]vidas|contribui[çc][õo]es)[^.]{0,40}(?:a\s+pagar|em\s+d[ií]vida|pendentes)|sem\s+valores\s+a\s+pagar|nada\s+a\s+pagar/i,
    /** Valor a pagar (EUR) tal como a SSD o mostra. */
    amount: /(?:valor|montante|total)[^\d€]{0,40}(\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})?)\s*€?/i,
    /** Entidade e referência Multibanco, na redação habitual dos avisos. */
    entity: /entidade\s*:?\s*(\d{5})/i,
    reference: /refer[êe]ncia\s*:?\s*(\d{3}\s?\d{3}\s?\d{3})/i,
    /** A sessão não é da empresa: a SSD mostra o NISS/NIF do titular. */
    nif: /\bNIF\b\s*:?\s*(\d{9})/i,
  },
  /** Quanta paciência se tem com a SSD, como na AT: uma espera, um servidor. */
  defaultTimeoutMs: 45_000,
} as const;

/**
 * Rota A — a entidade da Segurança Social no cofre do TOConline
 * (`/vault-actions`). A grelha é a mesma da AT: `span.entity_title` com a
 * classe `valid` quando a senha está gravada e validada, e o cofre
 * (`window.vault.accesses.company.SS`) confirma-o. TODO(recon): o título exato
 * da entidade e a chave do cofre (`SS`) são palpite até à Fase 0.
 */
export const TOC_DIRECT_ACCESS_SS = {
  entity: 'span.entity_title:has-text("Segurança Social")',
  entityValid: 'span.entity_title.valid:has-text("Segurança Social")',
  vaultKey: "SS",
  label: "Segurança Social",
} as const;

/** O que um adaptador da SSD aceita ver substituído nos testes. */
export interface SsOptions {
  portalOrigin?: string;
  portalHostPattern?: RegExp;
  timeoutMs?: number;
}
