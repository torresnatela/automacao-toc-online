import { AtIntegrityError } from "../errors";

/**
 * O ÚNICO ficheiro com seletores, caminhos e URLs do Portal das Finanças.
 *
 * A razão de existir é a Fase 0 (reconhecimento com credenciais reais): quando
 * alguém finalmente vir as páginas verdadeiras, só há **dois** ficheiros a
 * mexer — este e `wording.ts` — e nenhuma linha de lógica. Tudo o que está
 * marcado `TODO(recon)` é palpite informado e assume-se errado até prova em
 * contrário.
 *
 * **XPath não é proibido aqui** (ao contrário de `src/toconline/`): o portal da
 * AT é renderizado no servidor, sem Shadow DOM, e há tabelas onde o XPath é
 * honestamente mais curto. Mesmo assim, CSS é a escolha por omissão — é o que o
 * Playwright otimiza e o que o resto do worker usa.
 *
 * Um seletor errado tem de falhar **alto** (`StructuralError` /
 * `AtIntegrityError`, não retentável) e nunca em silêncio: contra a AT, uma
 * tentativa desperdiçada é uma tentativa a menos antes do bloqueio da conta.
 */
export const AT = {
  /**
   * A entrada é sempre pelo acesso.gov.pt, que devolve ao portal do IVA através
   * do `path`. O `partID=DPIV` é o que identifica a aplicação de destino.
   */
  loginUrl:
    "https://www.acesso.gov.pt/v2/loginForm?partID=DPIV&path=/dpiva/portal/cc/obter-doc-pagamento",

  /** Origem de tudo o que é IVA depois de autenticado. */
  portalOrigin: "https://iva.portaldasfinancas.gov.pt",

  /**
   * Dois conjuntos de caminhos porque há duas formas de lá chegar: como
   * contabilista certificado a agir por um cliente (`cc`, que exige a seleção
   * prévia do NIF) ou já dentro da conta do próprio contribuinte (`direct`).
   */
  paths: {
    cc: {
      consultarDeclaracao: "/dpiva/portal/cc/consultar-declaracao",
      obterDocumentoPagamento: "/dpiva/portal/cc/obter-doc-pagamento",
      listaClientes: "/pagantiva/listaClientesToc/entrar",
    },
    direct: {
      consultarDeclaracao: "/dpiva/portal/consultar-declaracao",
      obterDocumentoPagamento: "/dpiva/portal/obter-doc-pagamento",
    },
  },

  /** Host do ecrã de autenticação. Ancorado nas duas pontas de propósito. */
  loginHostPattern: /^www\.acesso\.gov\.pt$/,
  /** Hosts aceites depois de autenticar. O `$` é o que trava `…gov.pt.evil.com`. */
  portalHostPattern: /^(iva|www|sitfiscal)\.portaldasfinancas\.gov\.pt$/,
  /**
   * Domínios de cookie da AT — o que a rota A limpa entre empresas no perfil
   * persistente. Login e portal, porque a sessão do `acesso.gov.pt` também é
   * do contribuinte e sobreviveria à limpeza do portal sozinho.
   */
  cookieDomainPattern: /(^|\.)(portaldasfinancas\.gov\.pt|acesso\.gov\.pt)$/,

  // TODO(recon): tudo daqui para baixo é palpite até à Fase 0.
  login: {
    usernameInput: 'input[name="username"]',
    passwordInput: 'input[type="password"]',
    submitButton: 'button[type="submit"]',
  },
  clientSelect: {
    nifInput: 'input[name="nif"]',
    submit: 'button[type="submit"]',
  },
  declarations: {
    table: "table",
    rows: "table tbody tr",
    headerCells: "table thead th",
    /**
     * As células de uma linha. `th` também, porque há tabelas da AT com a
     * primeira coluna marcada como cabeçalho de linha — e perdê-la desalinhava
     * a linha inteira em relação ao cabeçalho.
     */
    cells: "td, th",
  },
  paymentDocument: {
    obtainButton:
      'button:has-text("Obter documento de pagamento"), a:has-text("Obter documento de pagamento")',
    fieldsContainer: "main",
    yearInput: 'select[name="ano"]',
    periodInput: 'select[name="periodo"]',
    submit: 'button[type="submit"]',
  },

  /**
   * Quanta paciência se tem com a AT. Um número só, como no TOConline: são a
   * mesma espera contra o mesmo servidor de terceiro, e separá-los fá-los-ia
   * divergir sem ninguém decidir nada.
   */
  defaultTimeoutMs: 45_000,
} as const;

/**
 * Rota A — chegar à AT por dentro do TOConline (Acesso Direto), sem gastar
 * credenciais da AT. Só entra em jogo se a Fase 0 mostrar que funciona.
 */
export const TOC_DIRECT_ACCESS = {
  summaryPath: "/summary",
  directAccessMenu: 'text="Acesso Direto"',
  portalFinancasItem: 'text="Portal das Finanças"',
  /** Função global do TOConline que troca a empresa ativa da sessão. */
  switchEntityFn: "switchToEntityAndNotifyPages",
} as const; // TODO(recon)

/**
 * O que um adaptador da AT aceita ver substituído. Existe para os testes
 * poderem apontar a um servidor local sem tocar nas constantes acima.
 */
export interface AtOptions {
  loginUrl?: string;
  portalOrigin?: string;
  loginHostPattern?: RegExp;
  portalHostPattern?: RegExp;
  timeoutMs?: number;
}

/**
 * Valida e devolve o host efetivo. Lança se a navegação foi parar a sítio
 * inesperado — o que, num fluxo com redirects de autenticação pelo meio, é o
 * sintoma de que o login mudou ou de que alguém está a interpor-se.
 *
 * Falha como `AtIntegrityError` (estrutural, não retentável) e leva só o host
 * no fingerprint: nunca a query string, que na AT carrega NIFs.
 */
export function assertAtHost(url: string, pattern: RegExp = AT.portalHostPattern): string {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    throw new AtIntegrityError(
      "at_unexpected_page",
      "URL inválida devolvida pelo Portal das Finanças.",
    );
  }
  if (!pattern.test(host)) {
    throw new AtIntegrityError(
      "at_unexpected_page",
      `O Portal das Finanças respondeu a partir de um host inesperado (${host}). O fluxo mudou.`,
      { host },
    );
  }
  return host;
}
