/**
 * Worker de RPA — consome a fila `jobs` e executa automações de browser.
 *
 * Roda fora da Vercel de propósito: precisa de um Chromium e de sessões longas,
 * que uma função serverless não sustenta. O dashboard só enfileira.
 *
 * Arranque: `pnpm --filter @toc/worker dev` (tsx watch), ou `run start`.
 */
import { createDb } from "@toc/db";
import { createTracer, DbStore } from "@toc/core";
import { SCAN_JOB_TYPE } from "@toc/core/domain";
import { loadEnv, MissingEnvError } from "./config/env";
import { PlaywrightBrowser } from "./browser/browser";
import { JobQueue } from "./runner/job-queue";
import { CompanyScanRunner } from "./runner/company-scan-runner";
import { WorkerLoop } from "./runner/worker-loop";
import { DbCompanyDirectory } from "./sinks/company-directory";
import { DbCredentialSource } from "./sinks/credential-source";
import { PlaywrightTocSessions } from "./toconline/session";
import { TocCompanyScanner } from "./toconline/scanner";
import { FileStorageStateStore } from "./toconline/storage-state";

function log(message: string, data: Record<string, unknown> = {}) {
  // Linha JSON estruturada, como o Logger do @toc/core. Nunca inclui segredos.
  console.log(JSON.stringify({ ts: new Date().toISOString(), source: "worker", message, ...data }));
}

async function main() {
  let env;
  try {
    env = loadEnv();
  } catch (err) {
    if (err instanceof MissingEnvError) {
      // A mensagem traz os NOMES das variáveis, nunca os valores.
      console.error(`[worker] ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  const db = createDb(env.databaseUrl);
  const store = new DbStore(db);
  const browser = new PlaywrightBrowser({ headless: env.headless });

  const runner = new CompanyScanRunner({
    tracer: createTracer(store),
    store,
    credentials: new DbCredentialSource(db, env.credentialsEncKey),
    sessions: new PlaywrightTocSessions({
      browser,
      state: new FileStorageStateStore(env.stateDir),
    }),
    scanner: new TocCompanyScanner(),
    directory: new DbCompanyDirectory(db),
  });

  const loop = new WorkerLoop({
    queue: new JobQueue(db),
    handlers: { [SCAN_JOB_TYPE]: runner },
    log,
  });

  // Encerramento limpo: o browser tem de fechar, senão fica um Chromium órfão.
  const controller = new AbortController();
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log("a encerrar", { signal });
    controller.abort();
    await browser.close().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  // `concurrency` não entra aqui de propósito: o WorkerLoop é estritamente
  // serial, e anunciar um número que não se cumpre faz o log mentir.
  log("worker no ar", { headless: env.headless, handles: [SCAN_JOB_TYPE] });

  await loop.start(controller.signal);
  await browser.close().catch(() => undefined);
}

main().catch((err) => {
  console.error("[worker] falha fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
