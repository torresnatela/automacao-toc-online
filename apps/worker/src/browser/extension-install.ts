import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  crx3ZipOffset,
  describeManifest,
  pickLatestVersionDir,
  type ManifestSummary,
} from "./extension-package";

/**
 * Instalar a extensão TOConline Connect no diretório que o Chromium do worker
 * carrega (`RPA_CHROME_EXTENSION_DIR`).
 *
 * Duas fontes, por esta ordem: a cópia que o Chrome do operador já tem (é a
 * mesma que ele usa no dia a dia, sem rede) e, na falta dela, a Web Store. O
 * destino é sempre **substituído** — misturar ficheiros de duas versões é a
 * forma mais silenciosa de ter uma extensão que carrega e não funciona.
 *
 * `_metadata/` sai sempre: o Chromium recusa carregar descompactadas com
 * pastas `_*` ("reserved for use by the system"), e é exatamente o que o Chrome
 * deixa dentro das instalações da Web Store.
 */

export interface InstalledExtension {
  source: "chrome_profile" | "web_store";
  version: string;
  dest: string;
}

/** A pasta versionada mais recente da extensão em qualquer perfil de qualquer raiz. */
export async function locateInChromeProfiles(input: {
  roots: string[];
  extensionId: string;
}): Promise<{ dir: string; version: string } | null> {
  const candidatos: string[] = [];
  const porNome = new Map<string, string>();

  for (const root of input.roots) {
    for (const perfil of await listar(root)) {
      const extensoes = join(root, perfil, "Extensions", input.extensionId);
      for (const versao of await listar(extensoes)) {
        candidatos.push(versao);
        // A mesma versão em dois perfis é a mesma extensão: fica a primeira.
        if (!porNome.has(versao)) porNome.set(versao, join(extensoes, versao));
      }
    }
  }

  const escolhida = pickLatestVersionDir(candidatos);
  if (escolhida === null) return null;
  return { dir: porNome.get(escolhida)!, version: escolhida };
}

/** `null` quando não há nada a copiar: quem chama decide se cai para a Web Store. */
export async function installFromChromeProfiles(input: {
  roots: string[];
  extensionId: string;
  dest: string;
}): Promise<InstalledExtension | null> {
  const achado = await locateInChromeProfiles(input);
  if (achado === null) return null;

  // Valida-se ANTES de tocar no destino: uma extensão errada não pode apagar
  // uma instalação boa.
  const manifest = await lerManifest(achado.dir);
  await substituir(input.dest, async () => {
    await cp(achado.dir, input.dest, {
      recursive: true,
      filter: (origem) => !origem.split(/[\\/]/).includes("_metadata"),
    });
  });
  return { source: "chrome_profile", version: manifest.version, dest: input.dest };
}

/**
 * Do CRX3 da Web Store ao diretório descompactado. O descompactador é
 * injetado (na prática `unzip -o -q`) para isto se testar sem um ZIP real.
 */
export async function installFromCrx(input: {
  crx: Buffer;
  dest: string;
  unzip: (zipPath: string, dest: string) => Promise<void>;
}): Promise<InstalledExtension> {
  const zip = input.crx.subarray(crx3ZipOffset(input.crx));
  const temporario = join(tmpdir(), `toconline-connect-${process.pid}-${Date.now()}.zip`);
  await writeFile(temporario, zip);
  try {
    await substituir(input.dest, async () => {
      await mkdir(input.dest, { recursive: true });
      await input.unzip(temporario, input.dest);
      await rm(join(input.dest, "_metadata"), { recursive: true, force: true });
    });
  } finally {
    await rm(temporario, { force: true });
  }
  const manifest = await lerManifest(input.dest);
  return { source: "web_store", version: manifest.version, dest: input.dest };
}

async function lerManifest(dir: string): Promise<ManifestSummary> {
  const raw = await readFile(join(dir, "manifest.json"), "utf8");
  return describeManifest(JSON.parse(raw) as unknown);
}

/** Apaga o destino e deixa `escrever` recriá-lo. */
async function substituir(dest: string, escrever: () => Promise<void>): Promise<void> {
  await rm(dest, { recursive: true, force: true });
  await escrever();
}

async function listar(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}
