/**
 * Worker de RPA — consome a fila `jobs` e executa automações de browser.
 *
 * Roda fora da Vercel de propósito: precisa de um Chromium e de sessões longas,
 * que uma função serverless não sustenta. O dashboard só enfileira.
 *
 * Arranque: `pnpm --filter @toc/worker dev` (tsx watch), ou `run start`.
 */
import { createClient } from "@supabase/supabase-js";
import { createDb } from "@toc/db";
import { createTracer, DbStore } from "@toc/core";
import { IVA_DOCUMENT_JOB_TYPE, SCAN_JOB_TYPE } from "@toc/core/domain";
import { loadEnv, MissingEnvError } from "./config/env";
import { PlaywrightBrowser } from "./browser/browser";
import { AtIvaDeclarationReader } from "./at/iva-declaration";
import { AtPaymentDocumentFetcher } from "./at/payment-document";
import { AcessoGovAtSessions } from "./at/session-acesso-gov";
import { TocDirectAccessAtSessions } from "./at/session-toc-direct-access";
import { PersistentChromiumBrowser } from "./browser/persistent-chromium";
import { JobQueue } from "./runner/job-queue";
import { CompanyScanRunner } from "./runner/company-scan-runner";
import { IvaDocumentRunner } from "./runner/iva-document-runner";
import { InMemoryPortalGate } from "./runner/portal-gate";
import { WorkerLoop } from "./runner/worker-loop";
import { DbAttemptGuard } from "./sinks/attempt-guard";
import { DbCompanyDirectory } from "./sinks/company-directory";
import { DbCredentialSource } from "./sinks/credential-source";
import { SupabaseDocumentStore } from "./sinks/document-store";
import { DbObligationLedger } from "./sinks/obligation-ledger";
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
  const tracer = createTracer(store);
  const browser = new PlaywrightBrowser({ headless: env.headless });
  // Rota A: perfil persistente com a extensão TOConline Connect. Só arranca no
  // primeiro job dessa rota — um worker que só faça varredura e rota B nunca
  // paga por ele.
  const persistent = new PersistentChromiumBrowser({
    userDataDir: env.chromeUserDataDir,
    extensionDir: env.chromeExtensionDir,
    headless: env.headless,
  });
  // Service role: o worker escreve no Storage por trás do RLS. Sem sessão
  // persistida nem refresh — é um processo, não um browser com utilizador.
  const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Uma só instância: a mesma tabela de credenciais serve as duas automações, e
  // duplicá-la duplicaria também a chave de cifra em memória sem ganho nenhum.
  const credentials = new DbCredentialSource(db, env.credentialsEncKey);

  const runner = new CompanyScanRunner({
    tracer,
    store,
    credentials,
    sessions: new PlaywrightTocSessions({
      browser,
      state: new FileStorageStateStore(env.stateDir),
    }),
    scanner: new TocCompanyScanner(),
    directory: new DbCompanyDirectory(db),
  });

  const ivaRunner = new IvaDocumentRunner({
    tracer,
    store,
    credentials,
    // As duas rotas ficam sempre registadas: é o `payload.access` de cada job
    // (o botão que o operador carregou) que escolhe.
    sessions: [
      new AcessoGovAtSessions({
        browser,
        state: new FileStorageStateStore(env.stateDir),
      }),
      new TocDirectAccessAtSessions({ persistent }),
    ],
    declarations: new AtIvaDeclarationReader(),
    documents: new AtPaymentDocumentFetcher(),
    storage: new SupabaseDocumentStore(supabase, env.documentsBucket),
    ledger: new DbObligationLedger(db),
    attempts: new DbAttemptGuard(db),
    gate: new InMemoryPortalGate({ pauseMs: env.atPortalPauseMs }),
    policy: { dailyAttemptCap: env.atDailyAttemptCap, pacingMs: env.atPacingMs },
  });

  const loop = new WorkerLoop({
    queue: new JobQueue(db),
    handlers: { [SCAN_JOB_TYPE]: runner, [IVA_DOCUMENT_JOB_TYPE]: ivaRunner },
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
    await persistent.close().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  // `concurrency` não entra aqui de propósito: o WorkerLoop é estritamente
  // serial, e anunciar um número que não se cumpre faz o log mentir.
  log("worker no ar", {
    headless: env.headless,
    handles: [SCAN_JOB_TYPE, IVA_DOCUMENT_JOB_TYPE],
    accessModes: ["at_direct_login", "toconline_direct_access"],
  });

  await loop.start(controller.signal);
  await browser.close().catch(() => undefined);
  await persistent.close().catch(() => undefined);
}

main().catch((err) => {
  console.error("[worker] falha fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
