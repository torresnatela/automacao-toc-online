import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Cifra de segredos de integração em repouso (AES-256-GCM).
 *
 * Serve `integration_credentials.secret_encrypted`: a senha do TOConline que o
 * utilizador grava no dashboard e que o worker precisa de usar mais tarde.
 * Cifra simétrica (não hash) porque o segredo tem de ser **recuperável** — não
 * estamos a verificar uma senha nossa, estamos a guardar a de um terceiro.
 *
 * GCM e não CBC: além de cifrar, autentica. Um ciphertext adulterado falha em
 * vez de decifrar em lixo silencioso.
 *
 * Formato: `v1:<iv_b64>:<tag_b64>:<ciphertext_b64>`. O prefixo de versão é o
 * gancho de rotação — um `v2` futuro pode conviver com `v1` na mesma coluna
 * enquanto um script recifra, sem migração de dados nem downtime.
 *
 * **Não usa AAD de propósito.** Ligar o ciphertext ao `credentialId` impediria
 * recifrar ao mover uma linha, e o ataque que isso travaria (trocar ciphertexts
 * entre linhas) exige service role — que já pode tudo. Fica registado como
 * não-objetivo consciente, não esquecimento.
 *
 * Este módulo importa `node:crypto`, que **não existe no runtime Edge**. É por
 * isso que vive num subpath próprio (`@toc/core/crypto`), como `auth/guard`:
 * nunca deve ser importado por middleware ou Client Component.
 */

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12; // recomendado para GCM
const TAG_BYTES = 16;

export type SecretCryptoErrorCode =
  /** `CREDENTIALS_ENC_KEY` ausente ou vazia. */
  | "missing_key"
  /** A chave existe mas não é base64 de exatamente 32 bytes. */
  | "invalid_key"
  /** O valor guardado não tem o formato `v1:<iv>:<tag>:<ct>`. */
  | "malformed_token"
  /** A tag GCM não autentica: chave errada OU ciphertext adulterado. */
  | "decrypt_failed";

/**
 * Mensagens **fixas**. Nunca interpolam chave, segredo, token ou o erro cru do
 * `node:crypto` — um erro de cifra acaba quase sempre num log, e o log é
 * exatamente onde um segredo não pode aparecer.
 */
const MESSAGES: Record<SecretCryptoErrorCode, string> = {
  missing_key: "Chave de cifra de credenciais não configurada.",
  invalid_key: "Chave de cifra de credenciais inválida (esperado 32 bytes em base64).",
  malformed_token: "Segredo armazenado em formato inesperado.",
  decrypt_failed: "Não foi possível decifrar o segredo armazenado.",
};

export class SecretCryptoError extends Error {
  readonly code: SecretCryptoErrorCode;

  constructor(code: SecretCryptoErrorCode) {
    // Sem `cause`: propagar o erro do node ("unable to authenticate data")
    // arrastaria detalhe de biblioteca para o stack de quem chamou.
    super(MESSAGES[code]);
    this.name = "SecretCryptoError";
    this.code = code;
  }
}

/** Resolve e valida a chave-mestra. O argumento explícito existe para os testes. */
function resolveKey(keyB64?: string): Buffer {
  const raw = keyB64 ?? process.env.CREDENTIALS_ENC_KEY;
  if (!raw) throw new SecretCryptoError("missing_key");

  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    throw new SecretCryptoError("invalid_key");
  }
  if (key.length !== KEY_BYTES) throw new SecretCryptoError("invalid_key");
  return key;
}

/** Cifra um segredo. Devolve `v1:<iv>:<tag>:<ciphertext>`, tudo em base64. */
export function encryptSecret(plaintext: string, keyB64?: string): string {
  const key = resolveKey(keyB64);
  const iv = randomBytes(IV_BYTES); // novo a cada cifragem: nunca reutilizar IV em GCM

  try {
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      VERSION,
      iv.toString("base64"),
      tag.toString("base64"),
      ciphertext.toString("base64"),
    ].join(":");
  } catch {
    throw new SecretCryptoError("invalid_key");
  }
}

interface ParsedToken {
  iv: Buffer;
  tag: Buffer;
  ciphertext: Buffer;
}

/** Interpreta o token sem decifrar. `null` quando o formato não bate. */
function parseToken(token: string): ParsedToken | null {
  const parts = token.split(":");
  if (parts.length !== 4) return null;

  const [version, ivB64, tagB64, ctB64] = parts as [string, string, string, string];
  if (version !== VERSION) return null;

  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) return null;

  return { iv, tag, ciphertext: Buffer.from(ctB64, "base64") };
}

/** Decifra um token produzido por `encryptSecret`. */
export function decryptSecret(token: string, keyB64?: string): string {
  const key = resolveKey(keyB64);

  const parsed = parseToken(token);
  if (!parsed) throw new SecretCryptoError("malformed_token");

  try {
    const decipher = createDecipheriv(ALGORITHM, key, parsed.iv);
    decipher.setAuthTag(parsed.tag);
    // `final()` é onde a tag é verificada: chave errada e ciphertext
    // adulterado falham aqui, e são indistinguíveis por desenho.
    return Buffer.concat([decipher.update(parsed.ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new SecretCryptoError("decrypt_failed");
  }
}

/**
 * Reconhece o formato sem tentar decifrar — útil para diagnóstico e para
 * distinguir uma coluna já cifrada de um valor legado em claro, sem precisar
 * da chave.
 */
export function isEncryptedSecret(value: string | null | undefined): boolean {
  if (!value) return false;
  return parseToken(value) !== null;
}

/** Gera uma chave-mestra nova em base64. Usado pelo runbook e pelos testes. */
export function generateEncryptionKey(): string {
  return randomBytes(KEY_BYTES).toString("base64");
}
