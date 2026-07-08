import { generateTempPassword } from "./password";
import { uiRoleToDbRole, type AppRole, type UiRole } from "./roles";

export interface CreateAuthUserResult {
  userId?: string;
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
  }): Promise<void>;
  /** Gerador da senha temporária (default: generateTempPassword). */
  generatePassword?: () => string;
}

export interface RegisterUserInput {
  email: string;
  fullName: string;
  uiRole: UiRole;
}

export type RegisterUserOutput =
  | { ok: true; email: string; tempPassword: string }
  | { ok: false; error: string };

/**
 * Orquestra o cadastro de um usuário pelo admin: gera senha temporária, cria o
 * usuário no Auth e atribui o papel (mapeado da UI). Se a criação falhar, NÃO
 * atribui papel. Lógica pura + injeção de dependência (testável sem Supabase).
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

  await deps.assignRole({
    userId: created.userId,
    role: uiRoleToDbRole(input.uiRole),
    fullName: input.fullName,
  });

  return { ok: true, email, tempPassword };
}
