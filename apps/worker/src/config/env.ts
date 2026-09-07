export interface WorkerEnv {
  databaseUrl: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  /** Chave-mestra AES-256-GCM (32 bytes em base64) que decifra `integration_credentials`. */
  credentialsEncKey: string;
  /**
   * Credenciais do TOConline. Opcionais de propósito: em produção vêm cifradas
   * da base de dados, resolvidas por `credentialId` no payload do job. Só os
   * scripts de reconhecimento (`scripts/recon-at.ts`, headed) as leem daqui.
   */
  toconlineUser?: string;
  toconlinePassword?: string;
  headless: boolean;
  rpaConcurrency: number;
  /** Diretório do `storageState` do Playwright (equivalente a credencial — git-ignored). */
  stateDir: string;

  /* --- Módulo 1 — guia de pagamento do IVA (AT) --------------------------- */

  /** Bucket do Supabase Storage onde ficam os PDFs das guias. */
  documentsBucket: string;
  /** Ritmo mínimo entre jobs de IVA. 182 empresas a 5 s são ~30 min, de propósito. */
  atPacingMs: number;
  /** Tentativas por empresa por dia: o portal é de um terceiro e não se martela. */
  atDailyAttemptCap: number;
  /** Quanto dura a pausa geral do portal depois de uma indisponibilidade. */
  atPortalPauseMs: number;
  /**
   * Rota A (Acesso Direto do TOConline): perfil persistente do Chromium do
   * Playwright. Guarda cookies do TOConline — é credencial, e git-ignored.
   */
  chromeUserDataDir: string;
  /**
   * Rota A: diretório da extensão TOConline Connect **descompactada**, que o
   * Chromium carrega nesse perfil. Instala-se com
   * `scripts/install-toconline-connect.ts`. Se lá não estiver, a rota A
   * termina em `direct_access_extension_missing` — o worker arranca na mesma.
   */
  chromeExtensionDir: string;
}

/** Erro de configuração. Carrega os NOMES das variáveis em falta — nunca valores. */
export class MissingEnvError extends Error {
  constructor(readonly variables: string[]) {
    super(`Variáveis de ambiente em falta: ${variables.join(", ")}`);
    this.name = "MissingEnvError";
  }
}

const REQUIRED = [
  "DATABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CREDENTIALS_ENC_KEY",
] as const;

const DEFAULT_RPA_CONCURRENCY = 1;
const DEFAULT_STATE_DIR = ".rpa";
const DEFAULT_DOCUMENTS_BUCKET = "documents";
const DEFAULT_AT_PACING_MS = 5_000;
const DEFAULT_AT_DAILY_ATTEMPT_CAP = 5;
const DEFAULT_AT_PORTAL_PAUSE_MS = 15 * 60_000;
/** Ao lado do `storageState`, pela mesma razão: é credencial. */
const DEFAULT_CHROME_USER_DATA_DIR = ".rpa/chromium-profile";
/** Onde `scripts/install-toconline-connect.ts` deixa a extensão por omissão. */
const DEFAULT_CHROME_EXTENSION_DIR = ".rpa/extensions/toconline-connect";

/**
 * Interpreta um inteiro positivo do ambiente, caindo para o valor por omissão
 * quando a variável está ausente, vazia, não é numérica ou não é um inteiro
 * positivo. Um número mal escrito no `.env` não pode derrubar o worker: o
 * default é sempre o valor seguro (mais lento, mais conservador).
 */
function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): WorkerEnv {
  const missing = REQUIRED.filter((key) => !source[key]);
  if (missing.length > 0) throw new MissingEnvError([...missing]);

  return {
    databaseUrl: source.DATABASE_URL as string,
    supabaseUrl: source.SUPABASE_URL as string,
    supabaseServiceRoleKey: source.SUPABASE_SERVICE_ROLE_KEY as string,
    credentialsEncKey: source.CREDENTIALS_ENC_KEY as string,
    toconlineUser: source.TOCONLINE_USER,
    toconlinePassword: source.TOCONLINE_PASSWORD,
    headless: source.RPA_HEADLESS !== "false",
    rpaConcurrency: parsePositiveInt(source.RPA_CONCURRENCY, DEFAULT_RPA_CONCURRENCY),
    stateDir: source.RPA_STATE_DIR || DEFAULT_STATE_DIR,
    documentsBucket: source.DOCUMENTS_BUCKET || DEFAULT_DOCUMENTS_BUCKET,
    atPacingMs: parsePositiveInt(source.AT_PACING_MS, DEFAULT_AT_PACING_MS),
    atDailyAttemptCap: parsePositiveInt(source.AT_DAILY_ATTEMPT_CAP, DEFAULT_AT_DAILY_ATTEMPT_CAP),
    atPortalPauseMs: parsePositiveInt(source.AT_PORTAL_PAUSE_MS, DEFAULT_AT_PORTAL_PAUSE_MS),
    chromeUserDataDir: source.RPA_CHROME_USER_DATA_DIR || DEFAULT_CHROME_USER_DATA_DIR,
    chromeExtensionDir: source.RPA_CHROME_EXTENSION_DIR || DEFAULT_CHROME_EXTENSION_DIR,
  };
}
