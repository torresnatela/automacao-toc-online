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
 * Rota A: sessão no Portal das Finanças aberta pelo **Acesso Direto do
 * TOConline**, com a extensão TOConline Connect a fazer o login por nós.
 *
 * Três coisas moldam este ficheiro.
 *
 * A primeira é que **a senha da AT nunca passa por aqui**. O TOConline
 * guarda-a, constrói o guião de login e entrega-o à extensão; a extensão abre
 * um separador novo e preenche o formulário. O que nós vemos é o separador —
 * um `page` novo no mesmo contexto — e o sítio onde ele aterra. Este código
 * não escuta, não regista e não serializa as mensagens entre a página e a
 * extensão.
 *
 * A segunda é que o browser é **um perfil persistente**, não um contexto por
 * empresa como na rota B: a extensão só vive num perfil, e um perfil tem um
 * contexto só. O isolamento entre empresas faz-se por logout (que a extensão
 * já faz antes de cada login) e pela limpeza das cookies da AT no `close()`;
 * a sessão do TOConline, essa, fica — é um login por lote, não por empresa.
 *
 * A terceira é que **a página do TOConline é Shadow DOM**: `innerText` não a
 * atravessa, e por isso os avisos («Instalar Extensão Chrome», «senha não
 * configurada») sondam-se com o motor de texto do Playwright, padrão a padrão.
 */

export interface TocDirectAccessOptions {
  toconline?: TocLoginOptions;
  /** Caminho do Sumário da empresa, onde vive o menu do Acesso Direto. */
  summaryPath?: string;
  at?: AtOptions;
  /** Quanto se espera pelo separador que a extensão abre e pelo Sumário renderizar. */
  directAccessTimeoutMs?: number;
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

export class TocDirectAccessAtSessions implements AtSessionFactory {
  readonly access = "toconline_direct_access" as const;
  readonly credentialProvider = "toconline" as const;

  private tocPage: Page | null = null;

  constructor(
    private readonly deps: { persistent: PersistentContextProvider },
    private readonly options: TocDirectAccessOptions = {},
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

  private get padroes(): { loginHostPattern: RegExp; portalHostPattern: RegExp } {
    return {
      loginHostPattern: this.options.at?.loginHostPattern ?? AT.loginHostPattern,
      portalHostPattern: this.options.at?.portalHostPattern ?? AT.portalHostPattern,
    };
  }

  /**
   * Sem a ligação ao TOConline não há empresa para vestir — e descobri-lo com
   * o browser já aberto gastaria um login do gabinete para nada.
   */
  precondition(company: AtCompanyHandle): AtPrecondition {
    return company.tocCompanyId !== null && company.tocCluster !== null
      ? { ok: true }
      : { ok: false, outcome: "company_not_linked" };
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

    await this.vestirEmpresa(toc.page, input.company);
    await toc.page.goto(`${toc.origin}${this.options.summaryPath ?? TOC_DIRECT_ACCESS.summaryPath}`, {
      waitUntil: "domcontentloaded",
      timeout: this.tocTimeout,
    });
    this.exigirPronto(await this.classificarSumario(toc.page));

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

  /**
   * A sessão do TOConline no perfil persistente: o perfil **é** o
   * `storageState`. Se o portal já nos conhece, `/login` devolve-nos à
   * aplicação e não há login a fazer; se ficamos no formulário, entra-se.
   */
  private async sessaoToconline(
    context: BrowserContext,
    credentials: PortalCredentials,
  ): Promise<SessaoToc> {
    const page = this.tocPage !== null && !this.tocPage.isClosed() ? this.tocPage : await context.newPage();
    this.tocPage = page;

    const loginUrl = this.options.toconline?.loginUrl ?? TOCONLINE.loginUrl;
    await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: this.tocTimeout });

    if (new URL(page.url()).pathname.includes("/login")) {
      const entrada = await submitLogin(page, credentials, this.options.toconline ?? {});
      return { page, origin: entrada.origin, host: entrada.host, reused: false };
    }

    const host = assertTocHost(page.url(), this.options.toconline?.hostPattern);
    return { page, origin: new URL(page.url()).origin, host, reused: true };
  }

  /**
   * Troca a empresa ativa pela função global da aplicação. Os argumentos vão
   * como valores, nunca interpolados numa string de código — e a função em
   * falta é o fluxo a ter mudado, não um azar da rede.
   */
  private async vestirEmpresa(page: Page, company: AtCompanyHandle): Promise<void> {
    const fn = TOC_DIRECT_ACCESS.switchEntityFn;
    let resultado: "ok" | "missing";
    try {
      resultado = await page.evaluate(
        async ([nome, id, cluster]) => {
          const janela = globalThis as unknown as Record<string, unknown>;
          const trocar = janela[nome];
          if (typeof trocar !== "function") return "missing" as const;
          await (trocar as (id: number | null, cluster: number | null) => unknown)(id, cluster);
          return "ok" as const;
        },
        [fn, company.tocCompanyId, company.tocCluster] as const,
      );
    } catch (err) {
      throw new StructuralError(
        `A troca de empresa no TOConline falhou (${err instanceof Error ? err.name : "erro"}). O fluxo mudou.`,
      );
    }
    if (resultado === "missing") {
      throw new StructuralError(
        `A função ${fn} não existe na aplicação do TOConline. O fluxo do Acesso Direto mudou.`,
      );
    }
  }

  /** Sonda os padrões um a um; `getByText` atravessa o Shadow DOM, `innerText` não. */
  private async sondar(page: Page): Promise<DirectAccessPageKind> {
    const ha = async (padrao: RegExp): Promise<boolean> => {
      try {
        return (await page.getByText(padrao).count()) > 0;
      } catch {
        return false;
      }
    };
    return classifyDirectAccessSignals({
      extensionMissing: await ha(DIRECT_ACCESS_WORDING.extensionMissing),
      passwordNotConfigured: await ha(DIRECT_ACCESS_WORDING.passwordNotConfigured),
      menuVisible: await ha(DIRECT_ACCESS_WORDING.directAccessMenu),
    });
  }

  /**
   * O Sumário só se decide depois de a aplicação ter falado com a extensão
   * (o handshake é assíncrono): espera-se até haver um veredicto ou acabar a
   * paciência — e aí `unknown` é o que fica.
   */
  private async classificarSumario(page: Page): Promise<DirectAccessPageKind> {
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
          "O TOConline não tem a senha da AT desta empresa gravada.",
        );
      case "unknown":
        throw new StructuralError(
          "O Sumário do TOConline não mostra o menu Acesso Direto. O fluxo mudou.",
        );
    }
  }

  /**
   * Clica no Acesso Direto → Portal das Finanças e espera pelo separador que a
   * extensão abre. Se nenhum abrir, é a página do TOConline que diz porquê.
   */
  private async abrirPortal(context: BrowserContext, tocPage: Page): Promise<Page> {
    const separador = context
      .waitForEvent("page", { timeout: this.directAccessTimeout })
      .catch(() => null);

    // O menu pode precisar de um clique para abrir; se não precisar, o clique
    // não faz mal. O item, esse, tem de estar lá.
    await tocPage
      .locator(TOC_DIRECT_ACCESS.directAccessMenu)
      .first()
      .click({ timeout: this.tocTimeout })
      .catch(() => undefined);
    try {
      await tocPage
        .locator(TOC_DIRECT_ACCESS.portalFinancasItem)
        .first()
        .click({ timeout: this.tocTimeout });
    } catch {
      throw new StructuralError(
        "O item «Portal das Finanças» do Acesso Direto não está no Sumário do TOConline. O fluxo mudou.",
      );
    }

    const atPage = await separador;
    if (atPage !== null) return atPage;

    // Nada abriu. A página do TOConline pode entretanto ter dito porquê.
    const kind = await this.sondar(tocPage);
    if (kind === "password_not_configured" || kind === "extension_missing") this.exigirPronto(kind);
    throw new AtTransientError(
      "direct_access_failed",
      "O Acesso Direto não abriu o Portal das Finanças dentro do tempo previsto.",
    );
  }

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
            "A extensão fechou o separador do Portal das Finanças antes de a sessão abrir.",
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
          "A extensão fechou o separador do Portal das Finanças antes de a sessão abrir.",
        );
      }
      const snapshot: AtPageSnapshot = {
        ...(await snapshotPage(atPage)),
        ...(documento.ultima === null ? {} : { status: documento.ultima.status() }),
      };
      throw loginErrorFrom(snapshot, this.padroes);
    } finally {
      documento.parar();
      (fechou as (() => void) | null)?.();
    }

    // A guarda corre sempre: um guião que entrasse com a senha de outra
    // empresa daria uma sessão perfeitamente válida — do contribuinte errado.
    const snapshot = await snapshotPage(atPage);
    assertSessionBelongsTo(snapshot.text, company.nif);
  }

  private wrap(
    context: BrowserContext,
    page: Page,
    host: string,
    abertas: Page[],
    pararRegisto: () => void,
  ): AuthenticatedAtSession {
    const portalOrigin = this.options.at?.portalOrigin ?? AT.portalOrigin;
    // Entrou-se como o próprio contribuinte: são os caminhos diretos, não os
    // do contabilista certificado.
    const urls: AtSessionUrls = {
      consultarDeclaracao: `${portalOrigin}${AT.paths.direct.consultarDeclaracao}`,
      obterDocumentoPagamento: `${portalOrigin}${AT.paths.direct.obterDocumentoPagamento}`,
    };
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
      .clearCookies({ domain: this.options.atCookieDomainPattern ?? AT.cookieDomainPattern })
      .catch(() => undefined);
  }
}
