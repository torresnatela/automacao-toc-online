export interface WorkerEnv {
  databaseUrl: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  toconlineUser: string;
  toconlinePassword: string;
  headless: boolean;
  rpaConcurrency: number;
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
  "TOCONLINE_USER",
  "TOCONLINE_PASSWORD",
] as const;

const DEFAULT_RPA_CONCURRENCY = 1;

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
    toconlineUser: source.TOCONLINE_USER as string,
    toconlinePassword: source.TOCONLINE_PASSWORD as string,
    headless: source.RPA_HEADLESS !== "false",
    rpaConcurrency: parseRpaConcurrency(source.RPA_CONCURRENCY),
  };
}
