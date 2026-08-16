import type { BrowserContext, Page } from "playwright";
import type { BrowserProvider } from "../browser/browser";
import { InvalidCredentialsError, StructuralError } from "../errors";
import type {
  AuthenticatedTocSession,
  OpenedSession,
  TocOnlineCredentials,
  TocSessionFactory,
} from "../runner/company-scan-runner";
import { TOCONLINE } from "./selectors";
import type { StorageStateStore } from "./storage-state";

/**
 * Autenticação no TOConline e reutilização da sessão do gabinete.
 *
 * O detalhe que molda tudo: **o login redireciona para um host shardado**
 * (`app5.toconline.pt`, `app11…`), e o número varia por conta. Fixar o host
 * seria garantir uma quebra silenciosa quando a conta migrasse de servidor —
 * por isso ele é *derivado do redirect* e guardado com a sessão.
 *
 * Reutilizar o `storageState` não é só velocidade: repetir o login a cada job
 * contra o portal de um terceiro é exatamente o padrão que dispara defesas
 * anti-automação.
 */

export interface TocOnlineOptions {
  loginUrl?: string;
  companiesPath?: string;
  /** Injetável para o teste apontar a um servidor local. */
  hostPattern?: RegExp;
  timeoutMs?: number;
}

/** Valida e devolve o host efetivo. Lança se o redirect levou a sítio inesperado. */
export function assertTocHost(url: string, pattern: RegExp = TOCONLINE.hostPattern): string {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    throw new StructuralError("URL inválida devolvida pelo TOConline após o login.");
  }
  if (!pattern.test(host)) {
    throw new StructuralError(
      `O TOConline redirecionou para um host inesperado (${host}). O fluxo de login mudou.`,
    );
  }
  return host;
}

const DEFAULT_TIMEOUT = 45_000;

export class PlaywrightTocSessions implements TocSessionFactory {
  constructor(
    private readonly deps: { browser: BrowserProvider; state: StorageStateStore },
    private readonly options: TocOnlineOptions = {},
  ) {}

  private get timeout(): number {
    return this.options.timeoutMs ?? DEFAULT_TIMEOUT;
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
      await page.goto(this.options.loginUrl ?? TOCONLINE.loginUrl, {
        waitUntil: "domcontentloaded",
        timeout: this.timeout,
      });

      await page.fill(TOCONLINE.usernameInput, credentials.username, { timeout: this.timeout });
      await page.fill(TOCONLINE.passwordInput, credentials.password, { timeout: this.timeout });
      await page.click(TOCONLINE.submitButton, { timeout: this.timeout });

      try {
        await page.waitForURL((url) => !url.pathname.includes("/login"), {
          timeout: this.timeout,
        });
      } catch {
        // Continuar na página de login é quase sempre credencial rejeitada,
        // mas não sempre — e classificar mal tem custo real: marcar inválida
        // uma credencial boa faz todos os jobs seguintes serem ignorados. Por
        // isso só se afirma "rejeitada" quando a página o diz.
        throw (await this.looksRejected(page))
          ? new InvalidCredentialsError()
          : new Error("O TOConline não concluiu o login dentro do tempo previsto.");
      }

      const host = assertTocHost(page.url(), this.options.hostPattern);
      const origin = new URL(page.url()).origin;

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

  /**
   * Procura por uma indicação visível de credencial recusada. Baseado em texto
   * e não num seletor porque o seletor exato é um achado da Fase 0 — e um
   * seletor errado falharia silenciosamente para o lado perigoso.
   */
  private async looksRejected(page: Page): Promise<boolean> {
    try {
      const aviso = page.getByText(/inválid|incorret|credenciais|palavra-passe|password/i);
      return (await aviso.count()) > 0;
    } catch {
      return false;
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
