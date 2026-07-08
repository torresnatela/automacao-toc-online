import { describe, it, expect } from "vitest";
import { registerUser, type RegisterUserDeps } from "../src/auth/index";

// Fakes no estilo do projeto (InMemoryStore): registram as chamadas, sem vi.mock.
function makeDeps(overrides: Partial<RegisterUserDeps> = {}) {
  const calls = {
    createAuthUser: [] as Array<{ email: string; password: string; fullName: string }>,
    assignRole: [] as Array<{ userId: string; role: string; fullName: string }>,
  };
  const deps: RegisterUserDeps = {
    generatePassword: () => "SENHA-FIXA-123",
    async createAuthUser(input) {
      calls.createAuthUser.push(input);
      return { userId: "user-1" };
    },
    async assignRole(input) {
      calls.assignRole.push(input);
    },
    ...overrides,
  };
  return { deps, calls };
}

describe("registerUser", () => {
  it("gera a senha temporária e cria o usuário Member com role viewer", async () => {
    const { deps, calls } = makeDeps();

    const out = await registerUser(deps, {
      email: "novo@toc.pt",
      fullName: "Novo Membro",
      uiRole: "member",
    });

    expect(out).toEqual({ ok: true, email: "novo@toc.pt", tempPassword: "SENHA-FIXA-123" });
    expect(calls.createAuthUser).toHaveLength(1);
    expect(calls.createAuthUser[0]!.password).toBe("SENHA-FIXA-123");
    expect(calls.assignRole).toHaveLength(1);
    expect(calls.assignRole[0]).toEqual({
      userId: "user-1",
      role: "viewer",
      fullName: "Novo Membro",
    });
  });

  it("cria usuário Admin com role admin", async () => {
    const { deps, calls } = makeDeps();

    await registerUser(deps, { email: "chefe@toc.pt", fullName: "Chefe", uiRole: "admin" });

    expect(calls.assignRole[0]!.role).toBe("admin");
  });

  it("propaga o erro do createAuthUser e NÃO atribui papel", async () => {
    const { deps, calls } = makeDeps({
      async createAuthUser() {
        return { error: "email já registado" };
      },
    });

    const out = await registerUser(deps, {
      email: "dup@toc.pt",
      fullName: "Dup",
      uiRole: "member",
    });

    expect(out).toEqual({ ok: false, error: "email já registado" });
    expect(calls.assignRole).toHaveLength(0);
  });

  it("rejeita email vazio sem chamar createAuthUser", async () => {
    const { deps, calls } = makeDeps();

    const out = await registerUser(deps, { email: "   ", fullName: "X", uiRole: "member" });

    expect(out.ok).toBe(false);
    expect(calls.createAuthUser).toHaveLength(0);
  });
});
