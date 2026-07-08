export interface ChangePasswordGuardInput {
  /** Há usuário autenticado nesta request? */
  authenticated: boolean;
  /** O profile do usuário exige troca de senha (must_change_password)? */
  mustChangePassword: boolean;
  /** Caminho (pathname) da request. */
  path: string;
}

/**
 * Decide se a request deve ser redirecionada para a troca de senha obrigatória.
 *
 * Retorna o destino do redirect (`"/change-password"`) ou `null` (segue normal).
 * O caso "não autenticado" é deixado para o guard de login existente.
 *
 * Anti-loop: nunca redireciona quando já está em `/change-password` (a própria
 * página e o POST da Server Action) nem em `/login` (permite logout/relogin).
 */
export function shouldRedirectToChangePassword(
  input: ChangePasswordGuardInput,
): "/change-password" | null {
  const { authenticated, mustChangePassword, path } = input;
  if (!authenticated) return null;
  if (!mustChangePassword) return null;
  if (path.startsWith("/change-password") || path.startsWith("/login")) {
    return null;
  }
  return "/change-password";
}
