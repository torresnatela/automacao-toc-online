import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  installFromChromeProfiles,
  installFromCrx,
  locateInChromeProfiles,
} from "../../src/browser/extension-install";
import { TOCONLINE_CONNECT_EXTENSION_ID } from "../../src/browser/extension-package";

/**
 * A parte com disco da instalação da extensão, contra uma árvore de perfis do
 * Chrome fabricada num diretório temporário. O que se prova aqui é o que
 * partiria em silêncio no Chromium: a pasta `_metadata/` (que ele recusa) e a
 * escolha da versão certa entre vários perfis.
 */

const ID = TOCONLINE_CONNECT_EXTENSION_ID;
const MANIFEST = { name: "TOConline Connect", version: "2.1", manifest_version: 3 };

let raiz: string;

beforeEach(async () => {
  raiz = await mkdtemp(join(tmpdir(), "toc-ext-"));
});

afterEach(async () => {
  await rm(raiz, { recursive: true, force: true });
});

/** Cria `<perfil>/Extensions/<id>/<versão>/` com manifest, um script e `_metadata`. */
async function extensaoNoPerfil(
  chromeRoot: string,
  perfil: string,
  versao: string,
  manifest: Record<string, unknown> = MANIFEST,
): Promise<string> {
  const dir = join(chromeRoot, perfil, "Extensions", ID, versao);
  await mkdir(join(dir, "_metadata"), { recursive: true });
  await mkdir(join(dir, "js"), { recursive: true });
  await writeFile(join(dir, "manifest.json"), JSON.stringify(manifest));
  await writeFile(join(dir, "js", "contentScript.js"), "// fixture");
  await writeFile(join(dir, "_metadata", "verified_contents.json"), "[]");
  return dir;
}

describe("locateInChromeProfiles", () => {
  it("encontra a versão mais recente entre todos os perfis de todas as raízes", async () => {
    const chrome = join(raiz, "Chrome");
    await extensaoNoPerfil(chrome, "Default", "2.1_0");
    const maisRecente = await extensaoNoPerfil(chrome, "Profile 6", "2.3_0");
    await extensaoNoPerfil(join(raiz, "Chromium"), "Default", "1.0_0");

    const achado = await locateInChromeProfiles({
      roots: [chrome, join(raiz, "Chromium"), join(raiz, "nao-existe")],
      extensionId: ID,
    });

    expect(achado).toEqual({ dir: maisRecente, version: "2.3_0" });
  });

  it("devolve null quando nenhum perfil tem a extensão", async () => {
    await mkdir(join(raiz, "Chrome", "Default", "Extensions"), { recursive: true });
    expect(await locateInChromeProfiles({ roots: [join(raiz, "Chrome")], extensionId: ID })).toBeNull();
  });
});

describe("installFromChromeProfiles", () => {
  it("copia a extensão para o destino sem a pasta _metadata e valida o manifest", async () => {
    const chrome = join(raiz, "Chrome");
    await extensaoNoPerfil(chrome, "Default", "2.1_0");
    const destino = join(raiz, "dest", "toconline-connect");

    const resultado = await installFromChromeProfiles({ roots: [chrome], extensionId: ID, dest: destino });

    expect(resultado).toEqual({ source: "chrome_profile", version: "2.1", dest: destino });
    expect((await readdir(destino)).sort()).toEqual(["js", "manifest.json"]);
    expect(JSON.parse(await readFile(join(destino, "manifest.json"), "utf8"))).toEqual(MANIFEST);
  });

  it("substitui uma instalação anterior em vez de a misturar com a nova", async () => {
    const chrome = join(raiz, "Chrome");
    await extensaoNoPerfil(chrome, "Default", "2.1_0");
    const destino = join(raiz, "dest");
    await mkdir(destino, { recursive: true });
    await writeFile(join(destino, "antigo.js"), "// versão anterior");

    await installFromChromeProfiles({ roots: [chrome], extensionId: ID, dest: destino });

    expect(await readdir(destino)).not.toContain("antigo.js");
  });

  it("devolve null quando não há nada a copiar (o script cai para a Web Store)", async () => {
    expect(
      await installFromChromeProfiles({ roots: [join(raiz, "vazio")], extensionId: ID, dest: join(raiz, "d") }),
    ).toBeNull();
  });

  it("recusa copiar uma extensão com outro nome no manifest", async () => {
    const chrome = join(raiz, "Chrome");
    await extensaoNoPerfil(chrome, "Default", "2.1_0", { ...MANIFEST, name: "Outra" });
    await expect(
      installFromChromeProfiles({ roots: [chrome], extensionId: ID, dest: join(raiz, "d") }),
    ).rejects.toThrow(/TOConline Connect/);
  });
});

describe("installFromCrx", () => {
  function crx3(zip: Buffer): Buffer {
    const cabecalho = Buffer.alloc(12);
    cabecalho.write("Cr24", 0, "ascii");
    cabecalho.writeUInt32LE(3, 4);
    cabecalho.writeUInt32LE(4, 8);
    return Buffer.concat([cabecalho, Buffer.from([1, 2, 3, 4]), zip]);
  }

  it("entrega ao descompactador só o ZIP, limpa _metadata e valida o manifest", async () => {
    const destino = join(raiz, "dest");
    const zipRecebido: Buffer[] = [];
    const unzip = async (zipPath: string, dest: string): Promise<void> => {
      zipRecebido.push(await readFile(zipPath));
      await mkdir(join(dest, "_metadata"), { recursive: true });
      await writeFile(join(dest, "manifest.json"), JSON.stringify(MANIFEST));
      await writeFile(join(dest, "_metadata", "x.json"), "{}");
    };

    const resultado = await installFromCrx({ crx: crx3(Buffer.from("PKzip")), dest: destino, unzip });

    expect(resultado).toEqual({ source: "web_store", version: "2.1", dest: destino });
    expect(zipRecebido[0]?.toString()).toBe("PKzip");
    expect(await readdir(destino)).toEqual(["manifest.json"]);
  });
});
