import { chmod, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type BrowserContext, type Worker } from "playwright";
import { installKeepNamesShim } from "./keep-names-shim";

/**
 * O browser da rota A: um Chromium **persistente** com a extensão TOConline
 * Connect carregada.
 *
 * Persistente porque a extensão só existe dentro de um perfil
 * (`launchPersistentContext`), e é do Chromium do Playwright — não do Google
 * Chrome — porque desde o Chrome 137 as builds de marca ignoram
 * `--load-extension`. Um perfil persistente tem **um** contexto só, e é por
 * isso que esta classe não é um `BrowserProvider`: não há `newContext()` a
 * dar; o isolamento entre empresas faz-se por logout e limpeza de cookies no
 * adaptador, não por contexto.
 *
 * A presença da extensão verifica-se **uma vez, no arranque**, pelo service
 * worker que ela regista. Depois disso o service worker MV3 adormece e
 * `context.serviceWorkers()` deixa de o listar — o que não quer dizer que a
 * extensão tenha desaparecido. Quem responde "está lá?" a meio da vida do
 * processo é a própria página do TOConline, não este ficheiro.
 */

export interface LoadedExtension {
  /** O id que o Chromium atribuiu (o `key` do manifest torna-o estável). */
  id: string;
  version: string;
}

export interface PersistentContextProvider {
  /** O único contexto do perfil; lançado à primeira utilização. */
  context(): Promise<BrowserContext>;
  /** `null` = nenhuma extensão configurada, ou o Chromium não a carregou. */
  extension(): Promise<LoadedExtension | null>;
  close(): Promise<void>;
}

export interface PersistentChromiumOptions {
  /** Perfil do Chromium. Guarda cookies do TOConline: tratado como credencial (0700). */
  userDataDir: string;
  /** Extensão descompactada a carregar. `null` = arranca sem extensão. */
  extensionDir: string | null;
  headless: boolean;
  launchTimeoutMs?: number;
  /** Quanto se espera pelo service worker da extensão depois de arrancar. */
  extensionTimeoutMs?: number;
}

export class PersistentChromiumBrowser implements PersistentContextProvider {
  private launching: Promise<BrowserContext> | null = null;
  private loaded: LoadedExtension | null = null;

  constructor(private readonly options: PersistentChromiumOptions) {}

  context(): Promise<BrowserContext> {
    if (this.launching === null) {
      // Single-flight: dois jobs a pedir o contexto ao mesmo tempo não podem
      // lançar dois Chromiums no mesmo perfil (o segundo falha e deixa lixo).
      this.launching = this.launch().catch((err: unknown) => {
        this.launching = null;
        throw err;
      });
    }
    return this.launching;
  }

  async extension(): Promise<LoadedExtension | null> {
    await this.context();
    return this.loaded;
  }

  async close(): Promise<void> {
    const pendente = this.launching;
    this.launching = null;
    this.loaded = null;
    if (pendente === null) return;
    try {
      const context = await pendente;
      await context.close();
    } catch {
      // Um lançamento que já falhou não tem nada para fechar.
    }
  }

  private async launch(): Promise<BrowserContext> {
    const { userDataDir } = this.options;
    // Sem manifest não há extensão a carregar: arranca-se sem ela e é
    // `extension() === null` — que o adaptador traduz em
    // `direct_access_extension_missing`, o desfecho que diz ao operador o que
    // falta. Rebentar aqui derrubaria também a rota B, que não precisa disto.
    const manifest =
      this.options.extensionDir === null ? null : await lerManifest(this.options.extensionDir);
    const extensionDir = manifest === null ? null : this.options.extensionDir;

    await mkdir(userDataDir, { recursive: true, mode: 0o700 });
    await chmod(userDataDir, 0o700);

    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: this.options.headless,
      timeout: this.options.launchTimeoutMs ?? 60_000,
      acceptDownloads: true,
      viewport: { width: 1600, height: 1000 },
      locale: "pt-PT",
      args:
        extensionDir === null
          ? []
          : [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
    });
    await installKeepNamesShim(context);

    if (manifest !== null) {
      const worker = await esperarServiceWorker(context, this.options.extensionTimeoutMs ?? 10_000);
      this.loaded = worker === null ? null : { id: new URL(worker.url()).host, version: manifest.version };
    }
    return context;
  }
}

/** `null` quando não há `manifest.json` no diretório — a extensão não está instalada. */
async function lerManifest(extensionDir: string): Promise<{ version: string } | null> {
  let raw: string;
  try {
    raw = await readFile(join(extensionDir, "manifest.json"), "utf8");
  } catch {
    return null;
  }
  const manifest = JSON.parse(raw) as { version?: unknown };
  return { version: typeof manifest.version === "string" ? manifest.version : "" };
}

/** O service worker da extensão, já registado ou a registar-se nos próximos instantes. */
async function esperarServiceWorker(context: BrowserContext, timeoutMs: number): Promise<Worker | null> {
  const daExtensao = (worker: Worker): boolean => worker.url().startsWith("chrome-extension://");
  const existente = context.serviceWorkers().find(daExtensao);
  if (existente !== undefined) return existente;
  try {
    return await context.waitForEvent("serviceworker", { predicate: daExtensao, timeout: timeoutMs });
  } catch {
    return null;
  }
}
