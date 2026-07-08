import { generateTempPassword } from "./password";
import { uiRoleToDbRole, type AppRole, type UiRole } from "./roles";

export interface CreateAuthUserResult {
  userId?: string;
  error?: string;
}

export interface AssignRoleResult {
  error?: string;
}

/**
 * Dependências injetáveis do cadastro. A implementação real (na Server Action do
 * web) usa o cliente Supabase service-role; os testes usam fakes.
 */
export interface RegisterUserDeps {
  createAuthUser(input: {
    email: string;
    password: string;
    fullName: string;
  }): Promise<CreateAuthUserResult>;
  assignRole(input: {
    userId: string;
    role: AppRole;
    fullName: string;
  }): Promise<AssignRoleResult>;
  /** Gerador da senha temporária (default: generateTempPassword). */
  generatePassword?: () => string;
}

export interface RegisterUserInput {
  email: string;
  fullName: string;
  uiRole: UiRole;
}

export type RegisterUserOutput =
  | { ok: true; email: string; tempPassword: string; warning?: string }
  | { ok: false; error: string };

/**
 * Orquestra o cadastro de um usuário pelo admin: gera senha temporária, cria o
 * usuário no Auth e atribui o papel (mapeado da UI). Lógica pura + injeção de
 * dependência (testável sem Supabase).
 *
 * Se a criação no Auth falhar, retorna erro. Se a criação suceder mas a
 * atribuição de papel falhar, o usuário JÁ EXISTE (com a senha temporária), então
 * retorna `ok: true` com a senha + um `warning` — o admin não pode perder a
 * credencial, e o usuário fica como Member até o papel ser corrigido.
 */
export async function registerUser(
  deps: RegisterUserDeps,
  input: RegisterUserInput,
): Promise<RegisterUserOutput> {
  const email = input.email.trim();
  if (!email) return { ok: false, error: "email obrigatório" };

  const tempPassword = (deps.generatePassword ?? generateTempPassword)();

  const created = await deps.createAuthUser({
    email,
    password: tempPassword,
    fullName: input.fullName,
  });
  if (created.error || !created.userId) {
    return { ok: false, error: created.error ?? "falha ao criar usuário" };
  }

  const assigned = await deps.assignRole({
    userId: created.userId,
    role: uiRoleToDbRole(input.uiRole),
    fullName: input.fullName,
  });
  if (assigned.error) {
    return { ok: true, email, tempPassword, warning: assigned.error };
  }

  return { ok: true, email, tempPassword };
}
