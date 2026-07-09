// Mínimo alinhado ao supabase config.toml (minimum_password_length = 6).
export const MIN_PASSWORD_LENGTH = 6;

/**
 * Valida a nova senha na troca. Retorna um código de erro (`"curta"` |
 * `"confere"`) ou `null` se estiver ok. Pura — testável no CI.
 */
export function validateNewPassword(
  password: string,
  confirm: string,
): "curta" | "confere" | null {
  if (password.length < MIN_PASSWORD_LENGTH) return "curta";
  if (password !== confirm) return "confere";
  return null;
}
