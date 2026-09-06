import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PersistentChromiumBrowser } from "../../src/browser/persistent-chromium";

/**
 * O browser persistente da rota A, com a extensão-fixture carregada. Sobe um
 * Chromium real (o do Playwright, `channel: "chromium"`): é o único sítio onde
 * se prova que `--load-extension` ainda funciona neste browser e que o service
 * worker da extensão aparece ao Playwright.
 */

const skip = process.env.SKIP_BROWSER_TESTS === "1";
const EXTENSAO = fileURLToPath(new URL("../fixtures/connect-extension", import.meta.url));

let perfil: string;
let browser: PersistentChromiumBrowser | null = null;

beforeEach(async () => {
  perfil = await mkdtemp(join(tmpdir(), "toc-perfil-"));
});

afterEach(async () => {
  await browser?.close();
  browser = null;
  await rm(perfil, { recursive: true, force: true });
});

describe.skipIf(skip)("PersistentChromiumBrowser", () => {
  it("carrega a extensão e expõe o id e a versão do seu service worker", async () => {
    browser = new PersistentChromiumBrowser({
      userDataDir: join(perfil, "profile"),
      extensionDir: EXTENSAO,
      headless: true,
    });

    const extension = await browser.extension();

    expect(extension).not.toBeNull();
    expect(extension?.id).toMatch(/^[a-p]{32}$/);
    expect(extension?.version).toBe("0.1");
  }, 60_000);

  it("é um contexto só: chamadas seguidas devolvem o mesmo BrowserContext", async () => {
    browser = new PersistentChromiumBrowser({
      userDataDir: join(perfil, "profile"),
      extensionDir: EXTENSAO,
      headless: true,
    });

    const a = await browser.context();
    const b = await browser.context();

    expect(a).toBe(b);
    // O perfil guarda cookies do TOConline (e, de passagem, da AT): só o dono lê.
    const modo = (await stat(join(perfil, "profile"))).mode & 0o777;
    expect(modo).toBe(0o700);
  }, 60_000);

  it("sem extensão configurada arranca na mesma e diz que ela não está lá", async () => {
    browser = new PersistentChromiumBrowser({
      userDataDir: join(perfil, "profile"),
      extensionDir: null,
      headless: true,
    });

    expect(await browser.extension()).toBeNull();
    expect((await browser.context()).pages().length).toBeGreaterThanOrEqual(0);
  }, 60_000);

  it("um diretório de extensão sem manifest é recusado antes de abrir o browser", async () => {
    browser = new PersistentChromiumBrowser({
      userDataDir: join(perfil, "profile"),
      extensionDir: join(perfil, "nao-existe"),
      headless: true,
    });

    await expect(browser.context()).rejects.toThrow(/manifest\.json/);
  }, 60_000);
});
