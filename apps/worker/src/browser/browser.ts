import { chromium, type Browser, type BrowserContext } from "playwright";
import type { StorageState } from "../toconline/storage-state";

/**
 * Um browser por processo, contextos por trabalho.
 *
 * O contexto é a unidade de isolamento: cookies e localStorage vivem nele, não
 * no browser. Um contexto novo por job garante que a sessão de um gabinete
 * nunca contamina a do seguinte — e é a mesma costura de que o Módulo 1 vai
 * precisar, lá com um contexto por empresa (a sessão do Portal das Finanças é
 * um cookie de domínio, e autenticar a empresa B derruba a da empresa A).
 *
 * Deliberadamente **não é um pool**: a concorrência por omissão é 1 e há uma
 * sessão só (a do gabinete). Um pool sem um segundo caso real seria abstração
 * especulativa; esta interface é a costura que o permite acrescentar depois
 * sem reescrever quem a usa.
 */
export interface BrowserProvider {
  newContext(options?: { storageState?: StorageState }): Promise<BrowserContext>;
  close(): Promise<void>;
}

export interface PlaywrightBrowserOptions {
  headless: boolean;
  launchTimeoutMs?: number;
}

export class PlaywrightBrowser implements BrowserProvider {
  private browser: Browser | null = null;

  constructor(private readonly options: PlaywrightBrowserOptions) {}

  /** Lançado à primeira utilização: um job que falha antes disto não paga o arranque. */
  private async ensure(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: this.options.headless,
        timeout: this.options.launchTimeoutMs ?? 60_000,
      });
    }
    return this.browser;
  }

  async newContext(options: { storageState?: StorageState } = {}): Promise<BrowserContext> {
    const browser = await this.ensure();
    return browser.newContext({
      storageState: options.storageState,
      // Viewport largo: a grelha do TOConline virtualiza por altura visível, e
      // uma janela minúscula reduz o que é renderizado sem necessidade.
      viewport: { width: 1600, height: 1000 },
      locale: "pt-PT",
    });
  }

  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
  }
}
