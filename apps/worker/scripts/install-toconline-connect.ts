/**
 * Instala a extensão **TOConline Connect** no diretório que o Chromium do worker
 * carrega (rota A — Acesso Direto do TOConline).
 *
 * Fontes, por ordem: (1) a cópia que o Google Chrome deste utilizador já tem
 * instalada da Web Store — sem rede, e é a mesma que o gabinete usa; (2) a
 * própria Web Store (CRX3 descompactado com `unzip`). O destino é substituído
 * por inteiro e a pasta `_metadata/` fica de fora (o Chromium recusa-a).
 *
 * Uso:
 *   pnpm --filter @toc/worker exec tsx scripts/install-toconline-connect.ts
 *   pnpm --filter @toc/worker exec tsx scripts/install-toconline-connect.ts --from-web-store
 *   RPA_CHROME_EXTENSION_DIR=/outro/sitio pnpm --filter @toc/worker exec tsx scripts/install-toconline-connect.ts
 *
 * O código da extensão é do TOConline: vive em `.rpa/` (git-ignored) e nunca é
 * versionado neste repositório.
 */
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { installFromChromeProfiles, installFromCrx } from "../src/browser/extension-install";
import {
  TOCONLINE_CONNECT_EXTENSION_ID,
  chromeExtensionRoots,
  webStoreCrxUrl,
} from "../src/browser/extension-package";

const execFileAsync = promisify(execFile);

/** Mesmo default do `env.ts`, resolvido a partir deste ficheiro (o pacote do worker). */
const DESTINO_POR_OMISSAO = fileURLToPath(
  new URL("../.rpa/extensions/toconline-connect", import.meta.url),
);

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const forcarWebStore = argv.includes("--from-web-store");
  const dest = resolve(process.env.RPA_CHROME_EXTENSION_DIR || DESTINO_POR_OMISSAO);

  if (!forcarWebStore) {
    const roots = chromeExtensionRoots({
      platform: process.platform,
      home: homedir(),
      ...(process.env.LOCALAPPDATA ? { localAppData: process.env.LOCALAPPDATA } : {}),
    });
    const copiada = await installFromChromeProfiles({
      roots,
      extensionId: TOCONLINE_CONNECT_EXTENSION_ID,
      dest,
    });
    if (copiada !== null) return terminar(copiada);
    console.log("[install-toconline-connect] não encontrada em nenhum perfil do Chrome; a descarregar da Web Store…");
  }

  const url = webStoreCrxUrl(TOCONLINE_CONNECT_EXTENSION_ID);
  const resposta = await fetch(url, { redirect: "follow" });
  if (!resposta.ok) {
    throw new Error(`A Web Store respondeu ${resposta.status} ao pedido do CRX.`);
  }
  const crx = Buffer.from(await resposta.arrayBuffer());
  const instalada = await installFromCrx({
    crx,
    dest,
    unzip: async (zipPath, destino) => {
      await execFileAsync("unzip", ["-o", "-q", zipPath, "-d", destino]);
    },
  });
  terminar(instalada);
}

function terminar(resultado: { source: string; version: string; dest: string }): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), script: "install-toconline-connect", ...resultado }));
  console.log(
    `\nTOConline Connect ${resultado.version} instalada em:\n  ${resultado.dest}\n` +
      `Aponte RPA_CHROME_EXTENSION_DIR para este caminho (é o default do worker).`,
  );
}

main().catch((err) => {
  console.error(`[install-toconline-connect] falhou: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
