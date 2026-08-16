import { describe, it, expect } from "vitest";
import { validateCredentialInput } from "../src/domain/integration/validate";
import { saveCredential, type CredentialRepo, type SecretCipher } from "../src/domain/integration/service";
import type { CredentialInput, CredentialRecord } from "../src/domain/integration/types";

const SENHA = "IvoCunha-senha-de-exemplo-1971";

function input(over: Partial<CredentialInput> = {}): CredentialInput {
  return {
    teamId: "22222222-2222-2222-2222-222222222222",
    provider: "toconline",
    username: "gabinete@example.pt",
    password: SENHA,
    ...over,
  };
}

class FakeRepo implements CredentialRepo {
  readonly inserted: CredentialRecord[] = [];
  readonly updated: { id: string; record: CredentialRecord }[] = [];
  lookups = 0;

  constructor(private readonly current: { id: string; hasSecret: boolean } | null = null) {}

  async findByTeamProvider() {
    this.lookups += 1;
    return this.current;
  }
  async insert(record: CredentialRecord) {
    this.inserted.push(record);
    return { id: "novo-id" };
  }
  async update(id: string, record: CredentialRecord) {
    this.updated.push({ id, record });
    return { found: true };
  }
}

const cipher: SecretCipher = { encrypt: (plaintext) => `cifrado(${plaintext.length})` };

describe("validateCredentialInput", () => {
  it("aceita uma entrada completa", () => {
    expect(validateCredentialInput(input(), { requirePassword: true })).toBeNull();
  });

  it("exige equipa, provider e utilizador", () => {
    expect(validateCredentialInput(input({ teamId: "  " }))?.teamId).toBeTruthy();
    expect(validateCredentialInput(input({ username: "  " }))?.username).toBeTruthy();
    expect(
      validateCredentialInput(input({ provider: "outro" as never }))?.provider,
    ).toBeTruthy();
  });

  it("exige a senha só quando pedido", () => {
    expect(validateCredentialInput(input({ password: "" }), { requirePassword: true })?.password).toBeTruthy();
    expect(validateCredentialInput(input({ password: "" }))).toBeNull();
  });

  // É a senha de um terceiro, não uma senha nossa: impor força seria impor uma
  // regra que o TOConline não tem e rejeitar credenciais válidas.
  it("não impõe regra de força à senha", () => {
    expect(validateCredentialInput(input({ password: "a" }), { requirePassword: true })).toBeNull();
  });

  it("nunca ecoa o valor da senha nas mensagens", () => {
    const errors = validateCredentialInput(input({ password: "" }), { requirePassword: true });
    expect(JSON.stringify(errors)).not.toContain(SENHA);
  });
});

describe("saveCredential", () => {
  it("cria quando não existe credencial para a equipa e provider", async () => {
    const repo = new FakeRepo(null);
    const result = await saveCredential(repo, cipher, input());

    expect(result).toEqual({ ok: true, id: "novo-id", created: true });
    expect(repo.inserted).toHaveLength(1);
    expect(repo.inserted[0]?.secretEncrypted).toBe(`cifrado(${SENHA.length})`);
    expect(repo.inserted[0]?.status).toBe("active");
  });

  it("normaliza o utilizador", async () => {
    const repo = new FakeRepo(null);
    await saveCredential(repo, cipher, input({ username: "  Gabinete@Example.PT  " }));
    expect(repo.inserted[0]?.username).toBe("gabinete@example.pt");
  });

  it("atualiza quando já existe", async () => {
    const repo = new FakeRepo({ id: "id-1", hasSecret: true });
    const result = await saveCredential(repo, cipher, input({ password: "nova-senha" }));

    expect(result).toEqual({ ok: true, id: "id-1", created: false });
    expect(repo.updated[0]?.record.secretEncrypted).toBe("cifrado(10)");
  });

  // O formulário não reexibe a senha, logo não a pode reenviar num update.
  it("senha vazia num update preserva o segredo guardado", async () => {
    const repo = new FakeRepo({ id: "id-1", hasSecret: true });
    const result = await saveCredential(repo, cipher, input({ password: "" }));

    expect(result).toMatchObject({ ok: true, created: false });
    expect(repo.updated[0]?.record.secretEncrypted).toBeNull();
  });

  it("senha ausente num update também preserva", async () => {
    const repo = new FakeRepo({ id: "id-1", hasSecret: true });
    await saveCredential(repo, cipher, input({ password: undefined }));
    expect(repo.updated[0]?.record.secretEncrypted).toBeNull();
  });

  it("exige senha quando a linha existe mas está sem segredo", async () => {
    const repo = new FakeRepo({ id: "id-1", hasSecret: false });
    const result = await saveCredential(repo, cipher, input({ password: "" }));

    expect(result).toMatchObject({ ok: false });
    expect(repo.updated).toHaveLength(0);
  });

  it("não consulta o repositório quando os campos base são inválidos", async () => {
    const repo = new FakeRepo(null);
    const result = await saveCredential(repo, cipher, input({ username: "" }));

    expect(result).toMatchObject({ ok: false });
    expect(repo.lookups).toBe(0);
    expect(repo.inserted).toHaveLength(0);
  });

  // A regra que protege tudo o resto: o texto claro morre nesta função.
  it("nunca entrega a senha em claro ao repositório", async () => {
    const repo = new FakeRepo(null);
    await saveCredential(repo, cipher, input());
    expect(JSON.stringify(repo.inserted)).not.toContain(SENHA);
  });

  it("propaga o erro de cifra como falha de serviço, sem expor a senha", async () => {
    const explodingCipher: SecretCipher = {
      encrypt: () => {
        throw new Error("Chave de cifra de credenciais não configurada.");
      },
    };
    const repo = new FakeRepo(null);
    const result = await saveCredential(repo, explodingCipher, input());

    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).not.toContain(SENHA);
    expect(repo.inserted).toHaveLength(0);
  });
});
