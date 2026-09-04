import { AT_ACCESS_MODES, type AtAccessMode } from "@toc/core/domain";

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

  /**
   * Por que rota se chega ao Portal das Finanças. Decidida na Fase 0
   * (reconhecimento) — até lá, `at_direct_login` é a única implementada.
   */
  atAccessMode: AtAccessMode;
  /** Bucket do Supabase Storage onde ficam os PDFs das guias. */
  documentsBucket: string;
  /** Ritmo mínimo entre jobs de IVA. 182 empresas a 5 s são ~30 min, de propósito. */
  atPacingMs: number;
  /** Tentativas por empresa por dia: o portal é de um terceiro e não se martela. */
  atDailyAttemptCap: number;
  /** Quanto dura a pausa geral do portal depois de uma indisponibilidade. */
  atPortalPauseMs: number;
  /** Só rota A: perfil de um Chrome real (a extensão do TOConline vive nele). */
  chromeUserDataDir?: string;
  /** Só rota A: diretório da extensão do TOConline a carregar nesse Chrome. */
  chromeExtensionDir?: string;
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
const DEFAULT_AT_ACCESS_MODE: AtAccessMode = "at_direct_login";
const DEFAULT_DOCUMENTS_BUCKET = "documents";
const DEFAULT_AT_PACING_MS = 5_000;
const DEFAULT_AT_DAILY_ATTEMPT_CAP = 5;
const DEFAULT_AT_PORTAL_PAUSE_MS = 15 * 60_000;

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

/**
 * Interpreta `AT_ACCESS_MODE`.
 *
 * Ao contrário dos números, um valor desconhecido **lança**: cair em silêncio
 * no default faria o worker abrir sessões contra o portal do Estado por uma
 * rota que ninguém pediu, e cada sessão errada gasta uma tentativa da senha do
 * gabinete. A mensagem leva o valor recebido — é o nome de uma rota, não um
 * segredo — e os valores aceites, para se corrigir sem ir ao código.
 */
function parseAtAccessMode(raw: string | undefined): AtAccessMode {
  if (!raw) return DEFAULT_AT_ACCESS_MODE;
  const match = AT_ACCESS_MODES.find((mode) => mode === raw);
  if (match === undefined) {
    throw new Error(
      `AT_ACCESS_MODE inválido (${raw}). Valores aceites: ${AT_ACCESS_MODES.join(", ")}.`,
    );
  }
  return match;
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
    atAccessMode: parseAtAccessMode(source.AT_ACCESS_MODE),
    documentsBucket: source.DOCUMENTS_BUCKET || DEFAULT_DOCUMENTS_BUCKET,
    atPacingMs: parsePositiveInt(source.AT_PACING_MS, DEFAULT_AT_PACING_MS),
    atDailyAttemptCap: parsePositiveInt(source.AT_DAILY_ATTEMPT_CAP, DEFAULT_AT_DAILY_ATTEMPT_CAP),
    atPortalPauseMs: parsePositiveInt(source.AT_PORTAL_PAUSE_MS, DEFAULT_AT_PORTAL_PAUSE_MS),
    chromeUserDataDir: source.RPA_CHROME_USER_DATA_DIR,
    chromeExtensionDir: source.RPA_CHROME_EXTENSION_DIR,
  };
}
