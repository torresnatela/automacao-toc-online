export interface WorkerEnv {
  databaseUrl: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  /** Chave-mestra AES-256-GCM (32 bytes em base64) que decifra `integration_credentials`. */
  credentialsEncKey: string;
  /**
   * Credenciais do TOConline. Opcionais de propósito: em produção vêm cifradas
   * da base de dados, resolvidas por `credentialId` no payload do job. Só o
   * smoke test live (TOC_LIVE=1) as lê daqui.
   */
  toconlineUser?: string;
  toconlinePassword?: string;
  headless: boolean;
  rpaConcurrency: number;
  /** Diretório do `storageState` do Playwright (equivalente a credencial — git-ignored). */
  stateDir: string;
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

/**
 * Interpreta `RPA_CONCURRENCY`, caindo para o valor por omissão quando a
 * variável está ausente, vazia, não é numérica ou não é um inteiro positivo.
 */
function parseRpaConcurrency(raw: string | undefined): number {
  if (!raw) return DEFAULT_RPA_CONCURRENCY;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_RPA_CONCURRENCY;
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
    rpaConcurrency: parseRpaConcurrency(source.RPA_CONCURRENCY),
    stateDir: source.RPA_STATE_DIR || DEFAULT_STATE_DIR,
  };
}
