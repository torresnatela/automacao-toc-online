// Helpers puros de auth/autorização. Este subpath (@toc/core/auth) NÃO importa
// @toc/db — para não arrastar drizzle/pg ao bundle do middleware do web.
export { generateTempPassword } from "./password";
export {
  shouldRedirectToChangePassword,
  type ChangePasswordGuardInput,
} from "./guard";
export {
  APP_ROLES,
  ROLE_ORDER,
  uiRoleToDbRole,
  dbRoleToUiLabel,
  type AppRole,
  type UiRole,
} from "./roles";
export {
  registerUser,
  type RegisterUserDeps,
  type RegisterUserInput,
  type RegisterUserOutput,
  type CreateAuthUserResult,
} from "./register";
