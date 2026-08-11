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
    rpaConcurrency: Number(source.RPA_CONCURRENCY ?? "1"),
  };
}
