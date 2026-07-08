import { randomInt as nodeRandomInt } from "node:crypto";

// Charset alfanumérico sem caracteres ambíguos (0/O, 1/l/I) — reduz erro ao
// digitar a senha temporária repassada manualmente pelo admin.
const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

// Alinha com supabase config.toml (minimum_password_length = 6).
const MIN_LENGTH = 6;

/**
 * Gera uma senha temporária aleatória.
 *
 * @param length comprimento da senha (default 14; mínimo 6).
 * @param randomInt gerador injetável (max) => inteiro em [0, max). Default: node:crypto.
 */
export function generateTempPassword(
  length = 14,
  randomInt: (max: number) => number = (max) => nodeRandomInt(max),
): string {
  if (length < MIN_LENGTH) {
    throw new Error(`comprimento mínimo da senha é ${MIN_LENGTH}`);
  }
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CHARSET[randomInt(CHARSET.length)];
  }
  return out;
}
