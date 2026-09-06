import type { BrowserContext, Page } from "playwright";
import type { BrowserProvider } from "../browser/browser";
import type {
  AuthenticatedTocSession,
  OpenedSession,
  TocOnlineCredentials,
  TocSessionFactory,
} from "../runner/ports";
import { assertTocHost, loginOnPage, type TocLoginOptions } from "./login";
import { TOCONLINE } from "./selectors";
import type { StorageStateStore } from "./storage-state";

export { assertTocHost };

/**
 * Autenticação no TOConline e reutilização da sessão do gabinete (Módulo 0:
 * um contexto por job, `storageState` guardado entre jobs).
 *
 * O login em si vive em `login.ts`, partilhado com o adaptador do Acesso
 * Direto (rota A). O que fica aqui é o ciclo de vida da sessão: reutilizar o
 * `storageState` não é só velocidade — repetir o login a cada job contra o
 * portal de um terceiro é exatamente o padrão que dispara defesas
 * anti-automação.
 */

export interface TocOnlineOptions extends TocLoginOptions {
  companiesPath?: string;
}

export class PlaywrightTocSessions implements TocSessionFactory {
  constructor(
    private readonly deps: { browser: BrowserProvider; state: StorageStateStore },
    private readonly options: TocOnlineOptions = {},
  ) {}

  private get timeout(): number {
    return this.options.timeoutMs ?? TOCONLINE.defaultTimeoutMs;
  }

  private get companiesPath(): string {
    return this.options.companiesPath ?? TOCONLINE.companiesPath;
  }

  async open(input: {
    credentialId: string;
    credentials: TocOnlineCredentials;
  }): Promise<OpenedSession> {
    const key = `toconline:${input.credentialId}`;

    const reused = await this.tryReuse(key);
    if (reused) return reused;

    return this.login(key, input.credentials);
  }

  /** Tenta entrar direto com a sessão guardada. `null` se ela já não vale. */
  private async tryReuse(key: string): Promise<OpenedSession | null> {
    const saved = await this.deps.state.load(key);
    if (!saved) return null;

    const context = await this.deps.browser.newContext({ storageState: saved.state });
    const page = await context.newPage();
    try {
      await page.goto(`${saved.origin}${this.companiesPath}`, {
        waitUntil: "domcontentloaded",
        timeout: this.timeout,
      });

      // Cookie expirado devolve-nos ao login: o estado guardado morreu.
      if (page.url().includes("/login")) {
        await context.close();
        await this.deps.state.clear(key);
        return null;
      }

      return { session: this.wrap(context, page, saved.host), reused: true };
    } catch {
      // Qualquer falha a reutilizar é recuperável fazendo login de novo — não
      // vale a pena distinguir os motivos.
      await context.close().catch(() => undefined);
      await this.deps.state.clear(key);
      return null;
    }
  }

  private async login(key: string, credentials: TocOnlineCredentials): Promise<OpenedSession> {
    const context = await this.deps.browser.newContext();
    const page = await context.newPage();

    try {
      const { host, origin } = await loginOnPage(page, credentials, this.options);

      await page.goto(`${origin}${this.companiesPath}`, {
        waitUntil: "domcontentloaded",
        timeout: this.timeout,
      });

      await this.deps.state.save(key, {
        host,
        origin,
        state: await context.storageState(),
        savedAt: new Date().toISOString(),
      });

      return { session: this.wrap(context, page, host), reused: false };
    } catch (err) {
      await context.close().catch(() => undefined);
      throw err;
    }
  }

  private wrap(context: BrowserContext, page: Page, host: string): AuthenticatedTocSession {
    return {
      page,
      host,
      close: async () => {
        await context.close();
      },
    };
  }
}
