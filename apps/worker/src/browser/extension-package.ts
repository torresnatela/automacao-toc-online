/**
 * A parte pura de instalar a extensão **TOConline Connect** para o Chromium do
 * worker: onde o Chrome a guarda, que versão escolher, como saltar o cabeçalho
 * de um CRX3 e o que exigir do `manifest.json`.
 *
 * Existe separada do script porque é o que se consegue testar sem disco nem
 * rede — e porque o cabeçalho CRX3 é o tipo de detalhe que se quer provar uma
 * vez e nunca mais ler.
 *
 * Porquê o Chromium do Playwright e não o Google Chrome: desde o Chrome 137 as
 * builds de marca ignoram `--load-extension`; o Chromium bundled continua a
 * aceitá-lo, inclusive em headless. O código da extensão é do TOConline e
 * **nunca é versionado** por nós — vive em `.rpa/` (git-ignored), copiado do
 * Chrome do operador ou descarregado da Web Store.
 */

/** Id público da extensão na Chrome Web Store. Estável: o manifest leva `key`. */
export const TOCONLINE_CONNECT_EXTENSION_ID = "lbcpogheaekofocmhfbidfkimgkfenkp";
export const TOCONLINE_CONNECT_NAME = "TOConline Connect";

/**
 * Raízes de perfis do Chrome por plataforma. Cada raiz contém perfis
 * (`Default`, `Profile 1`, …) e cada perfil uma pasta `Extensions/<id>/<versão>`.
 */
export function chromeExtensionRoots(input: {
  platform: NodeJS.Platform;
  home: string;
  localAppData?: string;
}): string[] {
  switch (input.platform) {
    case "darwin":
      return [`${input.home}/Library/Application Support/Google/Chrome`];
    case "linux":
      return [`${input.home}/.config/google-chrome`, `${input.home}/.config/chromium`];
    case "win32":
      return input.localAppData ? [`${input.localAppData}\\Google\\Chrome\\User Data`] : [];
    default:
      return [];
  }
}

/** `2.10_0` → [2, 10]. O sufixo `_N` é o contador de reinstalação do Chrome, irrelevante. */
function versaoDe(nome: string): number[] | null {
  const match = /^(\d+(?:\.\d+)*)_\d+$/.exec(nome);
  if (!match) return null;
  return match[1]!.split(".").map(Number);
}

/**
 * A pasta de versão mais recente de entre as que o Chrome deixou. Compara
 * número a número (`2.10` > `2.9`), não como texto.
 */
export function pickLatestVersionDir(names: string[]): string | null {
  let melhor: { nome: string; versao: number[] } | null = null;
  for (const nome of names) {
    const versao = versaoDe(nome);
    if (versao === null) continue;
    if (melhor === null || compararVersoes(versao, melhor.versao) > 0) melhor = { nome, versao };
  }
  return melhor?.nome ?? null;
}

function compararVersoes(a: number[], b: number[]): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

const CRX_MAGIC = "Cr24";
const CRX3_VERSION = 3;
const CRX_PREAMBLE_BYTES = 12;

/**
 * Onde começa o ZIP dentro de um CRX3: `Cr24` (4) + versão (4, LE) + tamanho do
 * cabeçalho (4, LE) + cabeçalho (assinaturas) → ZIP.
 */
export function crx3ZipOffset(buffer: Buffer): number {
  if (buffer.length < CRX_PREAMBLE_BYTES || buffer.toString("ascii", 0, 4) !== CRX_MAGIC) {
    throw new Error("O ficheiro não é um CRX3 (magic `Cr24` em falta).");
  }
  const version = buffer.readUInt32LE(4);
  if (version !== CRX3_VERSION) {
    throw new Error(`O ficheiro não é um CRX3 (versão ${version}).`);
  }
  const headerLength = buffer.readUInt32LE(8);
  const offset = CRX_PREAMBLE_BYTES + headerLength;
  if (buffer.length < offset) {
    throw new Error("O CRX3 está truncado antes do fim do cabeçalho.");
  }
  return offset;
}

/**
 * URL de descarga direta da Web Store. O `prodversion` só precisa de ser um
 * Chrome recente o bastante para o servidor aceitar servir CRX3.
 */
export function webStoreCrxUrl(id: string, chromeVersion = "120.0.0.0"): string {
  const url = new URL("https://clients2.google.com/service/update2/crx");
  url.searchParams.set("response", "redirect");
  url.searchParams.set("prodversion", chromeVersion);
  url.searchParams.set("acceptformat", "crx3");
  url.searchParams.set("x", `id=${id}&uc`);
  return url.toString();
}

export interface ManifestSummary {
  name: string;
  version: string;
  manifestVersion: number;
}

/** O que se exige do `manifest.json` antes de o dar por instalado. */
export function describeManifest(manifest: unknown): ManifestSummary {
  if (typeof manifest !== "object" || manifest === null) {
    throw new Error("O manifest.json da extensão não é um objeto.");
  }
  const { name, version, manifest_version: manifestVersion } = manifest as Record<string, unknown>;
  if (name !== TOCONLINE_CONNECT_NAME) {
    throw new Error(`A extensão não é a ${TOCONLINE_CONNECT_NAME} (name=${String(name)}).`);
  }
  if (typeof version !== "string" || version.length === 0) {
    throw new Error("O manifest.json da extensão não tem `version`.");
  }
  return {
    name,
    version,
    manifestVersion: typeof manifestVersion === "number" ? manifestVersion : 0,
  };
}
