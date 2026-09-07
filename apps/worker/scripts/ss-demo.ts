/**
 * Demonstração / Fase 0 da Segurança Social — headed, uma empresa.
 *
 * Abre o TOConline pela rota A (perfil persistente + extensão TOConline
 * Connect), veste a empresa, clica na entidade «Segurança Social» do Acesso
 * Direto, percorre a SSD até ao documento de pagamento por Multibanco e grava
 * o PDF em `.rpa/out/`. Cada passo é impresso no terminal: ao primeiro ensaio
 * real é isso que diz onde os seletores (`src/ss/selectors.ts`, todos
 * `TODO(recon)`) precisam de acerto.
 *
 * Uso (a partir da raiz do repo — nada carrega o `.env` por si):
 *   set -a && . ./.env && set +a && \
 *     pnpm --filter @toc/worker exec tsx scripts/ss-demo.ts --company <tocCompanyId> [--nif <nif>]
 *
 * Credenciais do TOConline **só por ambiente** (`TOCONLINE_USER`/`TOCONLINE_PASSWORD`).
 * A senha da Segurança Social nunca passa por aqui: está no cofre do TOConline.
 *
 * Opcional: RPA_CHROME_USER_DATA_DIR (omissão .rpa/chromium-profile, o mesmo
 * do worker, para reaproveitar a sessão do TOConline) e
 * RPA_CHROME_EXTENSION_DIR (omissão .rpa/extensions/toconline-connect).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PersistentChromiumBrowser } from "../src/browser/persistent-chromium";
import type { SessionLog } from "../src/runner/ports";
import { SsPaymentDocumentFetcher } from "../src/ss/payment-document";
import { TocDirectAccessSsSessions } from "../src/ss/session-toc-direct-access";

const PERFIL_POR_OMISSAO = fileURLToPath(new URL("../.rpa/chromium-profile", import.meta.url));
const EXTENSAO_POR_OMISSAO = fileURLToPath(new URL("../.rpa/extensions/toconline-connect", import.meta.url));
const SAIDA = fileURLToPath(new URL("../.rpa/out", import.meta.url));

const USO = `
Uso: set -a && . ./.env && set +a && pnpm --filter @toc/worker exec tsx scripts/ss-demo.ts --company <tocCompanyId> [--nif <nif>]
Credenciais só por ambiente: TOCONLINE_USER, TOCONLINE_PASSWORD
`.trim();

function abortar(mensagem: string): never {
  console.error(`[ss-demo] ${mensagem}`);
  process.exit(1);
}

function lerArgumentos(argv: string[]): { tocCompanyId: number; nif: string | null } {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined || !arg.startsWith("--")) continue;
    const proximo = argv[i + 1];
    flags.set(arg.slice(2), proximo !== undefined && !proximo.startsWith("--") ? proximo : "");
  }
  if (flags.has("help")) {
    console.log(USO);
    process.exit(0);
  }
  const id = flags.get("company") ?? "";
  if (!/^\d+$/.test(id)) abortar(`--company tem de ser o id numérico da empresa no TOConline.\n\n${USO}`);
  const nif = flags.get("nif") ?? null;
  if (nif !== null && !/^\d{9}$/.test(nif)) abortar("--nif tem de ter 9 dígitos.");
  return { tocCompanyId: Number(id), nif };
}

function mensagemDe(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

async function main(): Promise<void> {
  const args = lerArgumentos(process.argv.slice(2));
  const username = process.env.TOCONLINE_USER;
  const password = process.env.TOCONLINE_PASSWORD;
  if (!username || !password) abortar("faltam TOCONLINE_USER / TOCONLINE_PASSWORD no ambiente.");

  const persistent = new PersistentChromiumBrowser({
    userDataDir: process.env.RPA_CHROME_USER_DATA_DIR || PERFIL_POR_OMISSAO,
    extensionDir: process.env.RPA_CHROME_EXTENSION_DIR || EXTENSAO_POR_OMISSAO,
    headless: false,
  });
  const log: SessionLog = {
    info: async (m, d) => console.log(`[ss-demo] ${m} ${JSON.stringify(d ?? {})}`),
    warn: async (m, d) => console.warn(`[ss-demo] AVISO ${m} ${JSON.stringify(d ?? {})}`),
  };
  // Demo headed de uma empresa: entra-se sempre com a sessão do TOConline
  // limpa. Uma sessão gravada no perfil persistente pode prender a «Validação
  // de sessão em curso»; começar do zero é fiável e não custa nada aqui.
  await (await persistent.context()).clearCookies().catch(() => undefined);
  // O 1.º clique no Acesso Direto falha com frequência e o adaptador repete;
  // 15 s chegam para a extensão abrir o separador e poupam a espera inútil.
  const sessions = new TocDirectAccessSsSessions({ persistent }, { directAccessTimeoutMs: 15_000 });
  const fetcher = new SsPaymentDocumentFetcher();

  const inicio = Date.now();
  let opened: Awaited<ReturnType<typeof sessions.open>> | null = null;
  try {
    console.log(`[ss-demo] a abrir a Segurança Social da empresa ${args.tocCompanyId} pelo Acesso Direto…`);
    opened = await sessions.open({
      company: { id: `toc-${args.tocCompanyId}`, nif: args.nif, tocCompanyId: args.tocCompanyId, tocCluster: null },
      credentialId: "demo",
      credentials: { username, password },
      scope: { teamId: "demo", companyId: null },
      log,
    });
    console.log(`[ss-demo] SSD aberta em ${opened.session.host} (${Math.round((Date.now() - inicio) / 1000)} s)`);

    const resultado = await fetcher.fetch(opened.session, {
      company: { id: `toc-${args.tocCompanyId}`, nif: args.nif, tocCompanyId: args.tocCompanyId, tocCluster: null },
      log,
    });

    if (resultado.kind === "nothing_to_pay") {
      console.log("[ss-demo] a Segurança Social diz que não há valores a pagar para esta empresa.");
      return;
    }

    await mkdir(SAIDA, { recursive: true, mode: 0o700 });
    const carimbo = new Date().toISOString().replace(/[:.]/g, "-");
    const ficheiro = join(SAIDA, `ss-${args.tocCompanyId}-${carimbo}.pdf`);
    await writeFile(ficheiro, resultado.pdf, { mode: 0o600 });
    console.log(`[ss-demo] PDF guardado (${resultado.pdf.length} bytes, via ${resultado.via}): ${ficheiro}`);
    console.log(
      `[ss-demo] campos: entidade=${resultado.fields.entity ?? "?"} referência=${resultado.fields.reference ?? "?"} valor=${resultado.fields.amount ?? "?"} €`,
    );
  } catch (err) {
    console.error(`[ss-demo] FALHOU: ${mensagemDe(err)}`);
    const fp = (err as { fingerprint?: unknown }).fingerprint;
    if (fp !== undefined) console.error(`[ss-demo] assinatura da página: ${JSON.stringify(fp)}`);
    process.exitCode = 1;
  } finally {
    await opened?.session.close().catch(() => undefined);
    await persistent.close().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error(`[ss-demo] falha fatal: ${mensagemDe(err)}`);
  process.exit(1);
});
