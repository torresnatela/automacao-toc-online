/**
 * Sessão assistida na AT — ferramenta manual, headed.
 *
 * É a saída operacional para quando o 2FA do Portal das Finanças for
 * obrigatório: um humano faz o login uma vez (com o SMS/OTP que só ele recebe),
 * o `storageState` resultante fica guardado na chave certa, e o worker
 * reaproveita-o sem nunca ver o segundo fator.
 *
 * O que fica em disco é **equivalente a uma credencial**: são os cookies de
 * sessão do gabinete na AT. Por isso vai para o mesmo diretório git-ignored do
 * resto (`RPA_STATE_DIR`, modo 0600) e nunca aparece em log nem em payload.
 *
 * Uso (nada carrega o `.env` por si — o preâmbulo é obrigatório):
 *   set -a && . ./.env && set +a && \
 *     pnpm --filter @toc/worker exec tsx scripts/seed-at-session.ts --team <teamId>
 *   set -a && . ./.env && set +a && \
 *     pnpm --filter @toc/worker exec tsx scripts/seed-at-session.ts --company <companyId>
 *
 * A chave segue a mesma regra do `AcessoGovAtSessions`: `at:team:<id>` quando a
 * credencial é do gabinete (um login serve os 182 clientes) e `at:company:<id>`
 * quando é do próprio contribuinte. Semear na chave errada faria a sessão de
 * uma empresa ser reaproveitada por outra — a troca de contribuinte a
 * acontecer sozinha.
 */
import { chromium } from "playwright";
import { assertAtHost, AT } from "../src/at/selectors";
import { installKeepNamesShim } from "../src/browser/keep-names-shim";
import { FileStorageStateStore } from "../src/toconline/storage-state";

/**
 * O mesmo valor por omissão do `loadEnv`, lido diretamente. Este script não
 * toca na base de dados nem no Supabase: exigir o `loadEnv` completo faria uma
 * ferramenta de login assistido recusar-se a arrancar por falta de um
 * `DATABASE_URL` de que não precisa.
 */
const DIRETORIO_DE_ESTADO = process.env.RPA_STATE_DIR || ".rpa";

const PREAMBULO = "set -a && . ./.env && set +a &&";

const USO = `
Uso (a partir da raiz do repo — nada carrega o .env por si):
  ${PREAMBULO} pnpm --filter @toc/worker exec tsx scripts/seed-at-session.ts --team <teamId>
  ${PREAMBULO} pnpm --filter @toc/worker exec tsx scripts/seed-at-session.ts --company <companyId>

Opcional: RPA_STATE_DIR (omissão: .rpa) e AT_RECON_USER (só o utilizador é
pré-preenchido; a senha e o 2FA são sempre escritos pela pessoa que está à
frente do ecrã).
`.trim();

function abortar(mensagem: string): never {
  console.error(`[seed-at] ${mensagem}`);
  process.exit(1);
}

/** `at:team:<id>` ou `at:company:<id>` — exatamente a chave que o worker lê. */
function lerChave(argv: string[]): string {
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

  const team = flags.get("team");
  const company = flags.get("company");
  if ((team && company) || (!team && !company)) {
    abortar(`Indique exatamente um de --team ou --company.\n\n${USO}`);
  }
  return team ? `at:team:${team}` : `at:company:${company as string}`;
}

async function main(): Promise<void> {
  const chave = lerChave(process.argv.slice(2));

  const browser = await chromium.launch({ headless: false, slowMo: 250 });
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1600, height: 1000 },
    locale: "pt-PT",
  });
  // Sob `tsx`, sem isto todo o `page.evaluate` rebenta. Ver `keep-names-shim.ts`.
  await installKeepNamesShim(context);
  const page = await context.newPage();

  try {
    await page.goto(AT.loginUrl, { waitUntil: "domcontentloaded", timeout: AT.defaultTimeoutMs });

    // Só o utilizador. A senha fica de fora de propósito: este script existe
    // porque há um humano à frente do ecrã para o 2FA, e é ele quem a escreve.
    const utilizador = process.env.AT_RECON_USER;
    if (utilizador) {
      try {
        await page.fill(AT.login.usernameInput, utilizador, { timeout: 5_000 });
      } catch {
        console.error("[seed-at] campo de utilizador não encontrado — preencha à mão.");
      }
    }

    console.log("\n[seed-at] ▶ Complete o login (senha + 2FA) até chegar ao Portal das Finanças.");
    console.log("[seed-at]   Depois carregue em ▶ Resume no Inspector do Playwright.\n");
    await page.pause();

    // A guarda corre DEPOIS da pausa: gravar um estado que não autentica nada
    // faria o worker gastar uma sessão contra a AT para o descobrir.
    const host = assertAtHost(page.url());
    const origin = new URL(page.url()).origin;

    await new FileStorageStateStore(DIRETORIO_DE_ESTADO).save(chave, {
      host,
      origin,
      state: await context.storageState(),
      savedAt: new Date().toISOString(),
    });

    // A chave e o host, nunca o conteúdo do estado.
    console.log(`\n[seed-at] sessão guardada: chave "${chave}", host ${host}`);
    console.log(`[seed-at] diretório: ${DIRETORIO_DE_ESTADO} (modo 0600, git-ignored)`);
    console.log("[seed-at] O worker reutiliza-a enquanto a AT a aceitar (~12 h).\n");
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error(`[seed-at] falha fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
