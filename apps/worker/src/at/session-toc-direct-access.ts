import type { BrowserContext, Page } from "playwright";
import type { PersistentContextProvider } from "../browser/persistent-chromium";
import { AtIntegrityError, AtTransientError, StructuralError } from "../errors";
import type {
  AtCompanyHandle,
  AtPrecondition,
  AtSessionFactory,
  AtSessionUrls,
  AuthenticatedAtSession,
  OpenedAtSession,
  PortalCredentials,
  SessionLog,
} from "../runner/ports";
import { assertTocHost, submitLogin, type TocLoginOptions } from "../toconline/login";
import { TOCONLINE } from "../toconline/selectors";
import { snapshotPage, type AtPageSnapshot } from "./classify-page";
import {
  DIRECT_ACCESS_WORDING,
  classifyDirectAccessSignals,
  type DirectAccessPageKind,
} from "./direct-access-wording";
import { followDocument } from "./follow-document";
import { assertSessionBelongsTo } from "./guards";
import { loginErrorFrom } from "./login-errors";
import { AT, TOC_DIRECT_ACCESS, assertAtHost, type AtOptions } from "./selectors";

/**
 * O portal que o Acesso Direto abre — a entidade no cofre do TOConline e a
 * forma de reconhecer a aterragem. A AT é a omissão; outro portal do cofre
 * (ex.: Segurança Social) seria o mesmo percurso com outra entidade, outro
 * host e outra guarda. Tudo o resto — sessão do TOConline, troca de empresa,
 * cofre, separador da extensão, limpeza — é partilhado, e é por isso que vive
 * neste `DirectAccessPortal` e não espalhado pela classe.
 */
export interface DirectAccessPortal {
  /** Nome para mensagens e logs («Portal das Finanças», «Segurança Social»). */
  label: string;
  /** A entidade na grelha do cofre, e a mesma já validada (senha gravada e aceite). */
  entity: string;
  entityValid: string;
  /** Chave em `window.vault.accesses.company` (`AT`, `SS`). */
  vaultKey: string;
  portalOrigin: string;
  portalHostPattern: RegExp;
  /** Cookies deste portal — o que se limpa entre empresas no perfil persistente. */
  cookieDomainPattern: RegExp;
  /** Lê o que ficou pelo caminho quando o separador não aterra no portal. */
  loginError(
    snapshot: AtPageSnapshot,
    padroes: { loginHostPattern: RegExp; portalHostPattern: RegExp },
  ): Error;
  /** A guarda de que a sessão aberta é da empresa certa. Lança se não for. */
  assertBelongs(pageText: string, company: AtCompanyHandle): void;
  /** Os URLs já resolvidos para a sessão (o runner não os constrói). */
  urls(portalOrigin: string): AtSessionUrls;
}

/** O Portal das Finanças: entrou-se como o próprio contribuinte, caminhos diretos. */
export const AT_PORTAL: DirectAccessPortal = {
  label: "Portal das Finanças",
  entity: TOC_DIRECT_ACCESS.portalEntity,
  entityValid: TOC_DIRECT_ACCESS.portalEntityValid,
  vaultKey: "AT",
  portalOrigin: AT.portalOrigin,
  portalHostPattern: AT.portalHostPattern,
  cookieDomainPattern: AT.cookieDomainPattern,
  loginError: (snapshot, padroes) => loginErrorFrom(snapshot, padroes),
  assertBelongs: (pageText, company) => assertSessionBelongsTo(pageText, company.nif),
  urls: (portalOrigin) => ({
    consultarDeclaracao: `${portalOrigin}${AT.paths.direct.consultarDeclaracao}`,
    obterDocumentoPagamento: `${portalOrigin}${AT.paths.direct.obterDocumentoPagamento}`,
  }),
};

/**
 * Rota A: sessão no Portal das Finanças aberta pelo **Acesso Direto do
 * TOConline**, com a extensão TOConline Connect a fazer o login por nós.
 *
 * Quatro coisas moldam este ficheiro (reconhecimento de 2026-09-06).
 *
 * A primeira é que **a senha da AT nunca passa por aqui**. O TOConline
 * guarda-a no cofre, constrói o guião de login e entrega-o à extensão; a
 * extensão abre um separador novo e preenche o formulário. O que nós vemos é o
 * separador — um `page` novo no mesmo contexto — e o sítio onde ele aterra.
 * Este código não escuta, não regista e não serializa as mensagens entre a
 * página e a extensão.
 *
 * A segunda é que o TOConline é uma SPA que **derruba a sessão a cada
 * navegação completa nossa** (`page.goto` depois do login devolve ao `/login`).
 * Por isso só se faz `goto` para o login; tudo o resto é feito pela própria
 * aplicação: `toc-app.switchToEntityAndNotifyPages(id, "/vault-actions")`
 * veste a empresa e aterra no Acesso Direto, e `toc-app.changeRoute` navega
 * dentro dela. Entre empresas o separador do TOConline fica aberto — é um
 * login por lote.
 *
 * A terceira é que o browser é **um perfil persistente**, não um contexto por
 * empresa como na rota B: a extensão só vive num perfil, e um perfil tem um
 * contexto só. O isolamento entre empresas faz-se por logout (que a extensão
 * já faz antes de cada login) e pela limpeza das cookies da AT no `close()`.
 *
 * A quarta é que **a página do TOConline é Shadow DOM**: `innerText` não a
 * atravessa, e por isso os sinais do cofre sondam-se com o motor de seletores
 * do Playwright e com o estado que a própria app expõe (`toc-app.session_data`,
 * `window.vault.accesses`).
 */

export interface TocDirectAccessOptions {
  toconline?: TocLoginOptions;
  at?: AtOptions;
  /** Quanto se espera pelo separador que a extensão abre e pelo cofre renderizar. */
  directAccessTimeoutMs?: number;
  /** Quanto se espera pela app ficar pronta ou devolver o login. */
  appReadyTimeoutMs?: number;
  /** Espera entre a 1.ª e a 2.ª tentativa de abrir o Acesso Direto. */
  retryDelayMs?: number;
  /** Cookies a limpar entre empresas. Injetável porque nos testes tudo é `127.0.0.1`. */
  atCookieDomainPattern?: RegExp;
}

/** A sessão do TOConline que se mantém entre empresas. Interna: não sai daqui. */
interface SessaoToc {
  page: Page;
  origin: string;
  host: string;
  reused: boolean;
}

/** O que a app diz de si própria num instante. `null` = a página estava a navegar. */
interface EstadoDaApp {
  pronta: boolean;
  loaded: boolean;
  entityId: number | null;
  path: string;
  loginForm: boolean;
}

export class TocDirectAccessAtSessions implements AtSessionFactory {
  readonly access = "toconline_direct_access" as const;
  readonly credentialProvider = "toconline" as const;

  private tocPage: Page | null = null;

  constructor(
    private readonly deps: { persistent: PersistentContextProvider },
    private readonly options: TocDirectAccessOptions = {},
    /** Que portal se abre a partir do cofre. A AT por omissão. */
    protected readonly portal: DirectAccessPortal = AT_PORTAL,
  ) {}

  private get tocTimeout(): number {
    return this.options.toconline?.timeoutMs ?? TOCONLINE.defaultTimeoutMs;
  }

  private get atTimeout(): number {
    return this.options.at?.timeoutMs ?? AT.defaultTimeoutMs;
  }

  private get directAccessTimeout(): number {
    return this.options.directAccessTimeoutMs ?? this.atTimeout;
  }

  private get appReadyTimeout(): number {
    return this.options.appReadyTimeoutMs ?? TOC_DIRECT_ACCESS.appReadyTimeoutMs;
  }

  private get retryDelayMs(): number {
    return this.options.retryDelayMs ?? 1_000;
  }

  private get padroes(): { loginHostPattern: RegExp; portalHostPattern: RegExp } {
    return {
      loginHostPattern: this.options.at?.loginHostPattern ?? AT.loginHostPattern,
      portalHostPattern: this.options.at?.portalHostPattern ?? this.portal.portalHostPattern,
    };
  }

  /**
   * Sem o id da empresa no TOConline não há empresa para vestir — e
   * descobri-lo com o browser já aberto gastaria um login do gabinete para nada.
   * O cluster é um detalhe da varredura: a troca na app só precisa do id.
   */
  precondition(company: AtCompanyHandle): AtPrecondition {
    return company.tocCompanyId !== null ? { ok: true } : { ok: false, outcome: "company_not_linked" };
  }

  async open(input: {
    company: AtCompanyHandle;
    credentialId: string;
    credentials: PortalCredentials;
    scope: unknown;
    log?: SessionLog;
  }): Promise<OpenedAtSession> {
    const context = await this.deps.persistent.context();
    if ((await this.deps.persistent.extension()) === null) {
      throw new AtIntegrityError(
        "direct_access_extension_missing",
        "A extensão TOConline Connect não está carregada no browser do worker.",
      );
    }

    const toc = await this.sessaoToconline(context, input.credentials);
    await input.log?.info("sessão TOConline", { host: toc.host, reused: toc.reused });

    await this.vestirEmpresa(toc.page, input.company, input.credentials);
    await input.log?.info("empresa vestida", { path: TOC_DIRECT_ACCESS.vaultActionsPath });
    this.exigirPronto(await this.classificarCofre(toc.page));

    // Tudo o que abrir a partir daqui é da AT e fecha com a sessão — inclusive
    // os popups que a captura do PDF vier a abrir mais à frente.
    const abertas: Page[] = [];
    const registar = (page: Page): void => {
      abertas.push(page);
    };
    context.on("page", registar);
    const pararRegisto = (): void => {
      context.off("page", registar);
    };

    try {
      const atPage = await this.abrirPortal(context, toc.page);
      await this.aterrar(atPage, input.company);
      const host = assertAtHost(atPage.url(), this.padroes.portalHostPattern);
      await input.log?.info("acesso direto aberto", { host });
      return {
        session: this.wrap(context, atPage, host, abertas, pararRegisto),
        reused: toc.reused,
      };
    } catch (err) {
      // Uma falha a meio não pode deixar o separador do contribuinte aberto,
      // nem as cookies dele vivas, para a empresa seguinte do lote.
      pararRegisto();
      await this.limparAt(context, abertas);
      throw err;
    }
  }

  /* ---------------------------------------------------------------------- *
   * TOConline
   * ---------------------------------------------------------------------- */

  /** O que `toc-app` diz de si própria; `null` enquanto a página navega. */
  private async lerApp(page: Page): Promise<EstadoDaApp | null> {
    try {
      return await page.evaluate(
        ([appElement, switchFn, loginField]) => {
          // Sem a lib DOM no worker: o browser entra pelo `globalThis`, como em
          // `classify-page.ts`.
          const janela = globalThis as unknown as {
            document: { querySelector: (s: string) => unknown };
            location: { pathname: string };
          };
          const app = janela.document.querySelector(appElement) as {
            session_data?: { session_loaded?: boolean; entity_id?: number | null };
            [k: string]: unknown;
          } | null;
          return {
            pronta: typeof app?.[switchFn] === "function",
            loaded: app?.session_data?.session_loaded === true,
            entityId: app?.session_data?.entity_id ?? null,
            path: janela.location.pathname,
            loginForm: janela.document.querySelector(loginField) !== null,
          };
        },
        [TOC_DIRECT_ACCESS.appElement, TOC_DIRECT_ACCESS.switchEntityFn, TOC_DIRECT_ACCESS.loginField] as const,
      );
    } catch {
      return null;
    }
  }

  /**
   * Espera até a app dizer que está pronta (`session_loaded`) ou até nos ter
   * devolvido ao formulário de login — a app aterra primeiro na shell e só
   * depois da «validação de sessão» decide, portanto olhar cedo demais para o
   * URL diz sempre «autenticado».
   */
  private async aguardarApp(
    page: Page,
    pronta: (estado: EstadoDaApp) => boolean,
    timeoutMs: number,
  ): Promise<"pronta" | "login" | "timeout"> {
    const fim = Date.now() + timeoutMs;
    for (;;) {
      const estado = await this.lerApp(page);
      if (estado !== null) {
        if (estado.loginForm && estado.path.includes("/login")) return "login";
        if (estado.pronta && estado.loaded && pronta(estado)) return "pronta";
      }
      if (Date.now() >= fim) return "timeout";
      await page.waitForTimeout(250).catch(() => undefined);
    }
  }

  /**
   * A sessão do TOConline no perfil persistente. Um separador só, reutilizado
   * entre empresas: enquanto a app disser que está pronta não há `goto`
   * nenhum — seria ele a derrubar a sessão. Só um separador novo (ou uma
   * sessão que a app entretanto deu por morta) passa pelo login.
   */
  private async sessaoToconline(
    context: BrowserContext,
    credentials: PortalCredentials,
  ): Promise<SessaoToc> {
    const nova = this.tocPage === null || this.tocPage.isClosed();
    const page = nova ? await context.newPage() : this.tocPage!;
    this.tocPage = page;

    const loginUrl = this.options.toconline?.loginUrl ?? TOCONLINE.loginUrl;
    if (nova) {
      await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: this.tocTimeout });
    }

    let reused = true;
    let estado = await this.aguardarApp(page, () => true, this.appReadyTimeout);
    if (estado === "login") {
      await submitLogin(page, credentials, this.options.toconline ?? {});
      reused = false;
      estado = await this.aguardarApp(page, () => true, this.appReadyTimeout);
    }
    // A «Validação de sessão em curso» do TOConline às vezes fica presa num
    // vaivém (401 → / → /login) que não é nem app pronta nem formulário. Um
    // `goto` ao login corta o vaivém e deixa a app recomeçar limpa — melhor do
    // que desistir e queimar uma tentativa + a trava do portal por uma
    // lentidão passageira. Faz-se UMA vez.
    if (estado === "timeout") {
      await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: this.tocTimeout });
      estado = await this.aguardarApp(page, () => true, this.appReadyTimeout);
      if (estado === "login") {
        await submitLogin(page, credentials, this.options.toconline ?? {});
        reused = false;
        estado = await this.aguardarApp(page, () => true, this.appReadyTimeout);
      }
    }
    if (estado !== "pronta") {
      throw new Error("O TOConline não ficou pronto dentro do tempo previsto.");
    }

    const host = assertTocHost(page.url(), this.options.toconline?.hostPattern);
    return { page, origin: new URL(page.url()).origin, host, reused };
  }

  /**
   * Veste a empresa pelo método da própria app, que navega já para o Acesso
   * Direto. Se a app nos devolver ao login pelo caminho (sessão que morreu no
   * servidor), entra-se de novo e repete-se **uma** vez.
   */
  private async vestirEmpresa(
    page: Page,
    company: AtCompanyHandle,
    credentials: PortalCredentials,
  ): Promise<void> {
    const id = company.tocCompanyId!;
    const destino = TOC_DIRECT_ACCESS.vaultActionsPath;

    for (let tentativa = 0; tentativa < 2; tentativa += 1) {
      const antes = await this.lerApp(page);
      if (antes === null || !antes.pronta) {
        throw new StructuralError(
          `A aplicação do TOConline não expõe ${TOC_DIRECT_ACCESS.switchEntityFn}. O fluxo do Acesso Direto mudou.`,
        );
      }
      // A promessa pode nunca resolver: o método navega a página inteira e o
      // contexto de avaliação morre com ela. É a chegada que se espera, não o
      // retorno.
      void page
        .evaluate(
          ([appElement, switchFn, entityId, url]) => {
            const janela = globalThis as unknown as {
              document: { querySelector: (s: string) => unknown };
            };
            const app = janela.document.querySelector(appElement) as Record<
              string,
              (id: number, url: string) => unknown
            >;
            return app[switchFn]!(entityId, url);
          },
          [TOC_DIRECT_ACCESS.appElement, TOC_DIRECT_ACCESS.switchEntityFn, id, destino] as const,
        )
        .catch(() => undefined);

      const estado = await this.aguardarApp(
        page,
        (s) => s.entityId === id && s.path === destino,
        this.appReadyTimeout,
      );
      if (estado === "pronta") return;
      if (estado === "login" && tentativa === 0) {
        await submitLogin(page, credentials, this.options.toconline ?? {});
        const depois = await this.aguardarApp(page, () => true, this.appReadyTimeout);
        if (depois !== "pronta") break;
        continue;
      }
      break;
    }
    throw new StructuralError(
      "A troca de empresa no TOConline não aterrou no Acesso Direto. O fluxo mudou.",
    );
  }

  /* ---------------------------------------------------------------------- *
   * Cofre (Acesso Direto)
   * ---------------------------------------------------------------------- */

  /**
   * Sonda os sinais do cofre e só decide quando ele **assentou**.
   *
   * Ao aterrar em `/vault-actions` a grelha ainda não existe e
   * `window.vault.accesses` está vazio; os acessos chegam ~1 s depois e é com
   * eles que a entidade ganha a classe `valid`. Decidir antes disso dava «senha
   * por gravar» a uma empresa com a senha gravada (aconteceu no primeiro ensaio
   * real). Por isso: enquanto não houver acessos carregados nem a entidade à
   * vista, é `unknown` e espera-se; com a entidade «Portal das Finanças»
   * `valid` é `ready`; com a entidade à vista mas sem `valid` (ou acessos
   * carregados sem AT válido) é senha por gravar; o convite a instalar a
   * extensão ganha a tudo.
   */
  private async sondar(page: Page): Promise<DirectAccessPageKind> {
    const ha = async (seletorOuPadrao: string | RegExp): Promise<boolean> => {
      try {
        const locator =
          typeof seletorOuPadrao === "string" ? page.locator(seletorOuPadrao) : page.getByText(seletorOuPadrao);
        return (await locator.count()) > 0;
      } catch {
        return false;
      }
    };
    const cofre = await page
      .evaluate((vaultKey) => {
        const vault = (globalThis as unknown as {
          vault?: { accesses?: Record<string, Record<string, { valid?: boolean }> | undefined> };
        }).vault;
        const company = vault?.accesses?.["company"];
        const carregado = company !== undefined && company !== null && Object.keys(company).length > 0;
        return { carregado, atValido: carregado && company?.[vaultKey]?.valid === true };
      }, this.portal.vaultKey)
      .catch(() => ({ carregado: false, atValido: false }));

    const instalar = await ha(DIRECT_ACCESS_WORDING.extensionMissing);
    const entidadeValida = await ha(this.portal.entityValid);
    const entidade = entidadeValida || (await ha(this.portal.entity));
    const assentou = cofre.carregado || entidade;
    const semSenha =
      assentou &&
      !entidadeValida &&
      ((entidade && !cofre.atValido) ||
        (cofre.carregado && !cofre.atValido) ||
        (await ha(DIRECT_ACCESS_WORDING.passwordNotConfigured)));

    return classifyDirectAccessSignals({
      extensionMissing: instalar,
      passwordNotConfigured: semSenha,
      menuVisible: entidadeValida,
    });
  }

  /**
   * O cofre só se decide depois de a app ter falado com a extensão e carregado
   * os acessos: espera-se até haver um veredicto ou acabar a paciência — e aí
   * `unknown` é o que fica.
   */
  private async classificarCofre(page: Page): Promise<DirectAccessPageKind> {
    const fim = Date.now() + this.directAccessTimeout;
    for (;;) {
      const kind = await this.sondar(page);
      if (kind !== "unknown" || Date.now() >= fim) return kind;
      await page.waitForTimeout(200);
    }
  }

  private exigirPronto(kind: DirectAccessPageKind): void {
    switch (kind) {
      case "ready":
        return;
      case "extension_missing":
        throw new AtIntegrityError(
          "direct_access_extension_missing",
          "O TOConline não reconhece a extensão TOConline Connect neste browser.",
        );
      case "password_not_configured":
        throw new AtIntegrityError(
          "direct_access_not_configured",
          `O TOConline não tem a senha de «${this.portal.label}» desta empresa gravada.`,
        );
      case "unknown":
        throw new StructuralError(
          `A página do Acesso Direto do TOConline não mostra «${this.portal.label}». O fluxo mudou.`,
        );
    }
  }

  /**
   * Clica na **entidade** «Portal das Finanças» e espera pelo separador que a
   * extensão abre — a AT autenticada na sua página inicial, de onde o fluxo
   * navega para a declaração/documento. Clica-se aqui, e não numa ação DPIVA:
   * o atalho de ação do TOConline é intermitente e aterra fora do fluxo.
   *
   * O primeiro clique falha com frequência («O acesso está indisponível»),
   * sem abrir separador nenhum, e um segundo clique costuma resolver
   * (observado ao vivo). Por isso tenta-se **duas vezes**, com uma pausa de
   * `retryDelayMs` (1 s por omissão) entre elas; só depois de as duas falharem
   * é que o desfecho é `direct_access_failed`. Se, entretanto, a página disser
   * que a extensão ou a senha faltam, isso ganha à retentativa.
   */
  private async abrirPortal(context: BrowserContext, tocPage: Page): Promise<Page> {
    const tentativas = 2;
    for (let tentativa = 1; tentativa <= tentativas; tentativa += 1) {
      const separador = context
        .waitForEvent("page", { timeout: this.directAccessTimeout })
        .catch(() => null);

      try {
        await tocPage
          .locator(this.portal.entityValid)
          .first()
          .click({ timeout: this.tocTimeout });
      } catch {
        throw new StructuralError(
          `A entidade «${this.portal.label}» não está no Acesso Direto do TOConline. O fluxo mudou.`,
        );
      }

      const atPage = await separador;
      if (atPage !== null) return atPage;

      // Nada abriu. Um problema de configuração (extensão/senha) não se resolve
      // com um segundo clique — sai já; uma indisponibilidade transitória, sim.
      const kind = await this.sondar(tocPage);
      if (kind === "password_not_configured" || kind === "extension_missing") this.exigirPronto(kind);

      if (tentativa < tentativas) {
        // Fecha o diálogo de erro do TOConline (tem um «OK») antes de repetir.
        await tocPage.keyboard.press("Escape").catch(() => undefined);
        await tocPage.waitForTimeout(this.retryDelayMs);
        continue;
      }
    }
    throw new AtTransientError(
      "direct_access_failed",
      `O Acesso Direto não abriu «${this.portal.label}», mesmo após uma segunda tentativa.`,
    );
  }

  /* ---------------------------------------------------------------------- *
   * AT
   * ---------------------------------------------------------------------- */

  /**
   * Espera que a extensão termine o login e o separador aterre no portal. O
   * que fica pelo caminho lê-se como na rota B (`loginErrorFrom`): o ecrã é o
   * mesmo, mude quem submeteu o formulário.
   */
  private async aterrar(atPage: Page, company: AtCompanyHandle): Promise<void> {
    const documento = followDocument(atPage);
    let fechou: (() => void) | null = null;
    const fechada = new Promise<never>((_, reject) => {
      const aoFechar = (): void =>
        reject(
          new AtTransientError(
            "direct_access_failed",
            `A extensão fechou o separador de «${this.portal.label}» antes de a sessão abrir.`,
          ),
        );
      atPage.once("close", aoFechar);
      fechou = () => atPage.removeListener("close", aoFechar);
    });
    // Sem isto, um separador que feche DEPOIS de aterrar deixava uma rejeição
    // sem dono a rebentar o processo.
    fechada.catch(() => undefined);

    try {
      await Promise.race([
        atPage.waitForURL((url) => this.padroes.portalHostPattern.test(url.host), {
          timeout: this.atTimeout,
        }),
        fechada,
      ]);
    } catch (err) {
      if (err instanceof AtTransientError) throw err;
      if (atPage.isClosed()) {
        throw new AtTransientError(
          "direct_access_failed",
          `A extensão fechou o separador de «${this.portal.label}» antes de a sessão abrir.`,
        );
      }
      const snapshot: AtPageSnapshot = {
        ...(await snapshotPage(atPage)),
        ...(documento.ultima === null ? {} : { status: documento.ultima.status() }),
      };
      throw this.portal.loginError(snapshot, this.padroes);
    } finally {
      documento.parar();
      (fechou as (() => void) | null)?.();
    }

    // A guarda corre sempre: um guião que entrasse com a senha de outra
    // empresa daria uma sessão perfeitamente válida — do contribuinte errado.
    const snapshot = await snapshotPage(atPage);
    this.portal.assertBelongs(snapshot.text, company);
  }

  private wrap(
    context: BrowserContext,
    page: Page,
    host: string,
    abertas: Page[],
    pararRegisto: () => void,
  ): AuthenticatedAtSession {
    const portalOrigin = this.options.at?.portalOrigin ?? this.portal.portalOrigin;
    // Entrou-se como o próprio contribuinte: são os caminhos diretos, não os
    // do contabilista certificado.
    const urls: AtSessionUrls = this.portal.urls(portalOrigin);
    return {
      page,
      access: this.access,
      urls,
      host,
      close: async () => {
        pararRegisto();
        await this.limparAt(context, abertas);
      },
    };
  }

  /**
   * Fecha o que a AT abriu e apaga as cookies dela. A sessão do TOConline não
   * se toca: é a mesma para a empresa seguinte.
   */
  private async limparAt(context: BrowserContext, abertas: Page[]): Promise<void> {
    for (const page of abertas.splice(0)) {
      if (!page.isClosed()) await page.close().catch(() => undefined);
    }
    await context
      .clearCookies({ domain: this.options.atCookieDomainPattern ?? this.portal.cookieDomainPattern })
      .catch(() => undefined);
  }
}
