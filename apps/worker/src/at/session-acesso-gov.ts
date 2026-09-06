import type { BrowserContext, Page, Response } from "playwright";
import type { BrowserProvider } from "../browser/browser";
import { AtAuthError, AtIntegrityError, AtTransientError } from "../errors";
import type {
  AtCompanyHandle,
  AtPrecondition,
  AtSessionFactory,
  AtSessionUrls,
  AuthenticatedAtSession,
  CredentialScope,
  OpenedAtSession,
  PortalCredentials,
} from "../runner/ports";
import type { StorageStateStore } from "../toconline/storage-state";
import { classifyAtPage, fingerprint, snapshotPage, type AtPageSnapshot } from "./classify-page";
import { assertSessionBelongsTo } from "./guards";
import { loginErrorFrom } from "./login-errors";
import { assertAtHost, AT, type AtOptions } from "./selectors";

/**
 * Rota B: sessão no Portal das Finanças com a credencial do próprio gabinete,
 * entrando pelo `acesso.gov.pt`.
 *
 * Duas coisas moldam este ficheiro, e nenhuma delas é o login em si.
 *
 * A primeira é o **contador de tentativas da AT**: três recusas trancam a conta
 * e a senha nova vem por carta, ~5 dias depois. Por isso nada aqui retenta uma
 * recusa, a classificação de uma recusa exige uma frase afirmativa do portal
 * (ver `wording.ts`), e um formulário devolvido sem aviso nenhum é
 * `AtTransientError`, nunca `AtAuthError` — errar para o lado da recusa custa a
 * conta do gabinete; errar para o outro custa uma tentativa.
 *
 * A segunda é que **a sessão é uma coisa e o cliente é outra**. O cookie de
 * autenticação é do contabilista e serve os 182 clientes; o cliente ativo é uma
 * escolha por cima dele, refeita a cada `open()` — mesmo quando a sessão foi
 * reutilizada. Assumir que a sessão reaproveitada já está no cliente certo é
 * exatamente como se descarrega a guia do contribuinte anterior, e é por isso
 * que a guarda `at_session_mismatch` existe e corre sempre.
 */

/**
 * Doze horas. Não é a validade real do cookie da AT (que ninguém nos diz): é o
 * ponto a partir do qual tentar reutilizar custa mais — uma navegação, um
 * redirect e um login na mesma — do que autenticar já.
 */
const VALIDADE_DO_ESTADO_MS = 12 * 60 * 60 * 1000;

export class AcessoGovAtSessions implements AtSessionFactory {
  readonly access = "at_direct_login" as const;
  readonly credentialProvider = "at" as const;

  constructor(
    private readonly deps: { browser: BrowserProvider; state: StorageStateStore },
    private readonly options: AtOptions = {},
  ) {}

  private get timeout(): number {
    return this.options.timeoutMs ?? AT.defaultTimeoutMs;
  }

  private get portalHostPattern(): RegExp {
    return this.options.portalHostPattern ?? AT.portalHostPattern;
  }

  /** O que `classifyAtPage` precisa de saber para distinguir login de portal. */
  private get padroes(): { loginHostPattern: RegExp; portalHostPattern: RegExp } {
    return {
      loginHostPattern: this.options.loginHostPattern ?? AT.loginHostPattern,
      portalHostPattern: this.portalHostPattern,
    };
  }

  /**
   * Sem NIF não há sequer como pedir o cliente ao portal — e descobri-lo com o
   * browser já aberto gastaria uma sessão para nada.
   */
  precondition(company: AtCompanyHandle): AtPrecondition {
    return company.nif ? { ok: true } : { ok: false, outcome: "company_nif_missing" };
  }

  /**
   * A chave do `storageState`.
   *
   * Uma por equipa quando a credencial é do gabinete (um login serve os 182
   * clientes) e uma por empresa quando a credencial é do próprio contribuinte —
   * misturá-las faria a sessão de uma empresa ser reaproveitada por outra, que
   * é a troca de contribuinte a acontecer sozinha.
   */
  private chave(scope: CredentialScope): string {
    return scope.companyId === null ? `at:team:${scope.teamId}` : `at:company:${scope.companyId}`;
  }

  async open(input: {
    company: AtCompanyHandle;
    credentialId: string;
    credentials: PortalCredentials;
    scope: CredentialScope;
  }): Promise<OpenedAtSession> {
    const key = this.chave(input.scope);
    const caminhos = caminhosDe(input.scope);
    const aberta =
      (await this.tryReuse(key, caminhos)) ?? (await this.login(key, input.credentials));

    try {
      // A seleção do cliente é POR ABERTURA, não por login: a sessão
      // reaproveitada está autenticada, não está no cliente certo.
      if (input.scope.companyId === null) {
        await this.selecionarCliente(key, aberta.page, aberta.origin, input.company);
      }
      return {
        session: this.wrap(aberta.context, aberta.page, aberta.host, aberta.origin, input.scope),
        reused: aberta.reused,
      };
    } catch (err) {
      // Uma falha a meio deixaria um contexto (e um Chromium) por fechar a cada
      // empresa do lote. Fecha-se antes de relançar.
      await aberta.context.close().catch(() => undefined);
      throw err;
    }
  }

  /**
   * Tenta entrar direto com a sessão guardada. `null` quando ela já não vale —
   * e nesse caso o estado é limpo, para a tentativa seguinte não repetir a
   * navegação inútil.
   */
  private async tryReuse(key: string, caminhos: CaminhosDoPortal): Promise<SessaoAberta | null> {
    const saved = await this.deps.state.load(key);
    if (saved === null) return null;

    const idade = Date.now() - Date.parse(saved.savedAt);
    if (!Number.isFinite(idade) || idade > VALIDADE_DO_ESTADO_MS) {
      await this.deps.state.clear(key);
      return null;
    }

    const context = await this.deps.browser.newContext({
      storageState: saved.state,
      acceptDownloads: true,
    });
    let page: Page | null = null;
    try {
      // `newPage()` dentro do `try`: falhar a abrir a página deixaria o
      // contexto (e o Chromium por trás dele) sem ninguém para o fechar.
      page = await context.newPage();
      const response = await page.goto(`${saved.origin}${caminhos.consultarDeclaracao}`, {
        waitUntil: "domcontentloaded",
        timeout: this.timeout,
      });
      const snapshot: AtPageSnapshot = {
        ...(await snapshotPage(page)),
        ...(response === null ? {} : { status: response.status() }),
      };
      const pagina = classifyAtPage(snapshot, this.padroes);

      // Sessão morta devolve-nos à família de login, seja qual for o ecrã.
      if (FAMILIA_DE_LOGIN.has(pagina.kind)) {
        await context.close().catch(() => undefined);
        await this.deps.state.clear(key);
        return null;
      }

      return { context, page, host: saved.host, origin: saved.origin, reused: true };
    } catch {
      // Qualquer falha a reutilizar resolve-se fazendo login de novo — não vale
      // a pena distinguir os motivos.
      await context.close().catch(() => undefined);
      await this.deps.state.clear(key);
      return null;
    }
  }

  private async login(key: string, credentials: PortalCredentials): Promise<SessaoAberta> {
    const context = await this.deps.browser.newContext({ acceptDownloads: true });
    let page: Page | null = null;

    try {
      // Idem `tryReuse`: dentro do `try`, para o contexto nunca ficar órfão.
      page = await context.newPage();
      const documento = seguirODocumento(page);

      await page.goto(this.options.loginUrl ?? AT.loginUrl, {
        waitUntil: "domcontentloaded",
        timeout: this.timeout,
      });

      await page.fill(AT.login.usernameInput, credentials.username, { timeout: this.timeout });
      await page.fill(AT.login.passwordInput, credentials.password, { timeout: this.timeout });
      await page.click(AT.login.submitButton, { timeout: this.timeout });

      try {
        // Espera-se pelo HOST do portal, não por "sair do /login": no
        // acesso.gov.pt o caminho muda várias vezes durante a autenticação, e
        // só a chegada ao portal prova que ela passou.
        await page.waitForURL((url) => this.portalHostPattern.test(url.host), {
          timeout: this.timeout,
        });
      } catch {
        throw await this.erroDeLogin(page, documento.ultima);
      } finally {
        documento.parar();
      }

      const host = assertAtHost(page.url(), this.portalHostPattern);
      const origin = new URL(page.url()).origin;

      // Só depois de aterrar no portal: guardar um estado que não autentica
      // nada faria a abertura seguinte gastar uma navegação para o descobrir.
      await this.deps.state.save(key, {
        host,
        origin,
        state: await context.storageState(),
        savedAt: new Date().toISOString(),
      });

      return { context, page, host, origin, reused: false };
    } catch (err) {
      await context.close().catch(() => undefined);
      throw err;
    }
  }

  /** O que a AT disse quando o login não chegou ao portal (ver `login-errors.ts`). */
  private async erroDeLogin(page: Page, resposta: Response | null): Promise<Error> {
    // O `status` é o que separa "o portal está em baixo" de "a página é
    // estranha": um 5xx pode vir com qualquer corpo, incluindo um sem palavra
    // nenhuma que a redação reconheça. Sem ele, uma avaria da AT era
    // classificada como `unknown` — estrutural — e matava o lote inteiro.
    return loginErrorFrom(await this.fotografar(page, resposta), this.padroes);
  }

  /**
   * Escolhe o contribuinte por NIF (só o contabilista certificado o faz) e
   * confirma que foi mesmo esse que abriu.
   *
   * A confirmação não é zelo: o portal reaproveita a sessão do último cliente
   * escolhido, e uma escolha que falhe em silêncio faz descarregar a guia do
   * contribuinte anterior para a pasta deste. Só se acusa quando os dois lados
   * **afirmam** NIFs diferentes — um NIF ausente ou ilegível não prova nada.
   */
  private async selecionarCliente(
    key: string,
    page: Page,
    origin: string,
    company: AtCompanyHandle,
  ): Promise<void> {
    const documento = seguirODocumento(page);
    try {
      const chegada = await page.goto(`${origin}${AT.paths.cc.listaClientes}`, {
        waitUntil: "domcontentloaded",
        timeout: this.timeout,
      });
      // Classificar ANTES de escrever: se a sessão morreu pelo caminho, o que
      // está à frente é o formulário de autenticação — e escrever um NIF no
      // campo errado só daria um timeout que não explica nada.
      await this.exigirPortal(key, page, chegada);

      await page.fill(AT.clientSelect.nifInput, company.nif ?? "", { timeout: this.timeout });
      // O submit é uma navegação: sem esperar por ela, o snapshot a seguir tanto
      // podia fotografar a página nova como a antiga.
      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: this.timeout }),
        page.click(AT.clientSelect.submit, { timeout: this.timeout }),
      ]);

      const snapshot = await this.fotografar(page, documento.ultima);
      await this.exigirPortal(key, page, null, snapshot);

      assertSessionBelongsTo(snapshot.text, company.nif);
    } finally {
      documento.parar();
    }
  }

  /** O snapshot com o `status` da resposta que serviu o documento, quando o há. */
  private async fotografar(page: Page, resposta: Response | null): Promise<AtPageSnapshot> {
    return {
      ...(await snapshotPage(page)),
      ...(resposta === null ? {} : { status: resposta.status() }),
    };
  }

  /**
   * "Ainda estou num sítio do portal onde possa continuar?" — e lança já com o
   * desfecho certo quando não estou.
   *
   * A separação que importa é entre o que se retenta e o que não se retenta.
   * Uma avaria do portal (5xx, manutenção) e uma sessão que expirou são
   * passageiras: um `AtTransientError` devolve o job à fila com backoff. Uma
   * página que ninguém reconhece é estrutural e para o lote — e é por isso que
   * o 5xx tem de ser visto pelo **código HTTP** e não só pela redação, que a AT
   * nem sempre escreve.
   */
  private async exigirPortal(
    key: string,
    page: Page,
    resposta: Response | null,
    jaFotografado?: AtPageSnapshot,
  ): Promise<void> {
    const snapshot = jaFotografado ?? (await this.fotografar(page, resposta));
    const pagina = classifyAtPage(snapshot, this.padroes);
    if (pagina.kind === "authorization_missing") throw new AtAuthError("authorization_missing");
    if (pagina.kind === "maintenance" || pagina.kind === "server_error") {
      throw new AtTransientError(
        "at_unavailable",
        "O Portal das Finanças está indisponível de momento.",
      );
    }
    if (FAMILIA_DE_LOGIN.has(pagina.kind)) {
      // O estado guardado já não vale: deitá-lo fora aqui evita que a tentativa
      // seguinte gaste a mesma navegação para descobrir o mesmo.
      await this.deps.state.clear(key);
      throw new AtTransientError(
        "at_unavailable",
        "A sessão da AT expirou a meio da escolha do contribuinte.",
      );
    }
    if (pagina.kind === "unknown") {
      throw new AtIntegrityError(
        "at_unexpected_page",
        "O Portal das Finanças respondeu com uma página inesperada ao escolher o contribuinte.",
        fingerprint(snapshot),
      );
    }
  }

  private wrap(
    context: BrowserContext,
    page: Page,
    host: string,
    origin: string,
    scope: CredentialScope,
  ): AuthenticatedAtSession {
    const caminhos = caminhosDe(scope);
    const urls: AtSessionUrls = {
      consultarDeclaracao: `${origin}${caminhos.consultarDeclaracao}`,
      obterDocumentoPagamento: `${origin}${caminhos.obterDocumentoPagamento}`,
    };
    return {
      page,
      access: this.access,
      urls,
      host,
      close: async () => {
        await context.close();
      },
    };
  }
}

/**
 * Guarda a última resposta do **documento principal** enquanto uma navegação
 * decorre, para o classificador poder ver o código HTTP.
 *
 * Um `Page` não sabe com que status foi servido, e nem toda a navegação passa
 * por um `goto` que devolva a `Response` — o submit de um formulário, por
 * exemplo. Sem isto, um 503 com um corpo que a redação não reconhece era
 * classificado como página desconhecida, ou seja, estrutural: uma avaria de
 * minutos na AT gastava a fila inteira sem retentativa nenhuma.
 *
 * O estado vive num objeto e não numa variável solta de propósito: o
 * TypeScript não vê as atribuições feitas dentro do ouvinte e estreitaria uma
 * variável `let` para `null` no ponto de leitura.
 */
function seguirODocumento(page: Page): { readonly ultima: Response | null; parar(): void } {
  const registo: { ultima: Response | null } = { ultima: null };
  const ouvinte = (resposta: Response): void => {
    if (!resposta.request().isNavigationRequest()) return;
    if (resposta.frame() !== page.mainFrame()) return;
    registo.ultima = resposta;
  };
  page.on("response", ouvinte);
  return {
    get ultima(): Response | null {
      return registo.ultima;
    },
    parar: () => page.removeListener("response", ouvinte),
  };
}

type CaminhosDoPortal = { consultarDeclaracao: string; obterDocumentoPagamento: string };

/**
 * Duas formas de lá chegar: como contabilista certificado a agir por um cliente
 * (credencial da equipa, `companyId: null`) ou já dentro da conta do próprio
 * contribuinte (credencial da empresa). O escopo da credencial é que decide.
 */
function caminhosDe(scope: CredentialScope): CaminhosDoPortal {
  return scope.companyId === null ? AT.paths.cc : AT.paths.direct;
}

/** O contexto já aberto e onde ele aterrou. Interno: não sai daqui. */
interface SessaoAberta {
  context: BrowserContext;
  page: Page;
  host: string;
  origin: string;
  reused: boolean;
}

/**
 * Tudo o que significa "a sessão não vale": o ecrã de autenticação aparece com
 * caras diferentes conforme o que a AT tem a dizer, e qualquer uma delas
 * responde à mesma pergunta.
 */
const FAMILIA_DE_LOGIN: ReadonlySet<string> = new Set([
  "login_form",
  "login_rejected",
  "mfa_challenge",
  "password_change",
  "password_blocked",
]);
