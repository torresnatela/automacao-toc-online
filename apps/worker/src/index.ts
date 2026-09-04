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
import { JobQueue } from "./runner/job-queue";
import { CompanyScanRunner } from "./runner/company-scan-runner";
import { IvaDocumentRunner } from "./runner/iva-document-runner";
import { InMemoryPortalGate } from "./runner/portal-gate";
import type { AtSessionFactory } from "./runner/ports";
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

/**
 * Escolhe o adaptador de sessão da AT conforme a rota configurada.
 *
 * Falha **no arranque** e não a meio de um job: uma rota que ainda não existe
 * descoberta à 143.ª empresa deixaria um lote meio feito e um trace aberto por
 * empresa. Aqui o processo nem sobe, e a mensagem diz o que falta.
 */
function criarSessoesAt(
  env: ReturnType<typeof loadEnv>,
  browser: PlaywrightBrowser,
): AtSessionFactory {
  if (env.atAccessMode === "at_direct_login") {
    return new AcessoGovAtSessions({
      browser,
      state: new FileStorageStateStore(env.stateDir),
    });
  }
  throw new Error(
    "AT_ACCESS_MODE=toconline_direct_access ainda não está disponível neste worker (aguarda a Fase 0).",
  );
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
    sessions: criarSessoesAt(env, browser),
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
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  // `concurrency` não entra aqui de propósito: o WorkerLoop é estritamente
  // serial, e anunciar um número que não se cumpre faz o log mentir.
  log("worker no ar", {
    headless: env.headless,
    handles: [SCAN_JOB_TYPE, IVA_DOCUMENT_JOB_TYPE],
    atAccessMode: env.atAccessMode,
  });

  await loop.start(controller.signal);
  await browser.close().catch(() => undefined);
}

main().catch((err) => {
  console.error("[worker] falha fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
