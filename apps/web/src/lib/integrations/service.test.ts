import { describe, it, expect, vi } from "vitest";
import type { CredentialRecord } from "@toc/core/domain";

// `service.ts` (e o cliente admin que ele importa) declaram-se `server-only`,
// um módulo que existe para rebentar fora do servidor. Sob o Vitest estamos
// exatamente onde ele quer estar — em Node — mas a resolução por condições não o
// sabe, por isso substitui-se por um módulo vazio.
vi.mock("server-only", () => ({}));

const { credentialRepo, withoutInvalidMarkers } = await import("@/lib/integrations/service");

describe("withoutInvalidMarkers", () => {
  it("apaga só os marcadores da invalidação", () => {
    expect(
      withoutInvalidMarkers({
        invalidReason: "login_rejeitado",
        invalidAt: "2026-09-01T10:00:00Z",
        attemptsLeft: 2,
        lastVerifiedBy: "worker",
        empresas: 12,
      }),
    ).toEqual({ lastVerifiedBy: "worker", empresas: 12 });
  });

  it("um metadata vazio continua vazio", () => {
    expect(withoutInvalidMarkers({})).toEqual({});
  });

  it("não mexe no objeto que recebe", () => {
    const original = { invalidReason: "senha_bloqueada", nota: "x" };
    withoutInvalidMarkers(original);
    expect(original).toEqual({ invalidReason: "senha_bloqueada", nota: "x" });
  });
});

// --- Duplo do cliente admin --------------------------------------------------

type Row = Record<string, unknown> | null;

interface FakeAdmin {
  /** Patches enviados ao `update`, por ordem. */
  readonly patches: Record<string, unknown>[];
  /** Quantos `select` correram — é como se vê se o `update` releu a linha. */
  readonly selects: string[];
}

/**
 * O mínimo do PostgREST que este adaptador usa: `.from().select().eq()…
 * .maybeSingle()` e `.from().update().eq().select()`. Não imita o Supabase —
 * imita a cadeia, que é o que aqui pode partir.
 */
function fakeAdmin(row: Row) {
  const patches: Record<string, unknown>[] = [];
  const selects: string[] = [];

  const from = () => ({
    select(columns: string) {
      selects.push(columns);
      const chain = {
        eq: () => chain,
        is: () => chain,
        maybeSingle: async () => ({ data: row, error: null }),
        single: async () => ({ data: row, error: null }),
      };
      return chain;
    },
    update(patch: Record<string, unknown>) {
      patches.push(patch);
      const chain = {
        eq: () => chain,
        select: async () => ({ data: [{ id: "cred-1" }], error: null }),
      };
      return chain;
    },
  });

  const admin = { from, patches, selects };
  return admin as unknown as Parameters<typeof credentialRepo>[0] & FakeAdmin;
}

function record(over: Partial<CredentialRecord> = {}): CredentialRecord {
  return {
    teamId: "22222222-2222-2222-2222-222222222222",
    provider: "toconline",
    username: "gabinete@example.pt",
    secretEncrypted: "cifrado",
    status: "active",
    metadata: {},
    ...over,
  };
}

/** A linha guardada que o worker deixou marcada como inválida. */
const invalidRow = {
  id: "cred-1",
  secret_encrypted: "cifrado-antigo",
  status: "invalid",
  metadata: {
    invalidReason: "login_rejeitado",
    invalidAt: "2026-09-01T10:00:00Z",
    attemptsLeft: 2,
    lastVerifiedBy: "worker",
  },
};

describe("credentialRepo.update", () => {
  it("uma senha nova reativa a credencial e limpa só os marcadores", async () => {
    const admin = fakeAdmin(invalidRow);
    const repo = credentialRepo(admin);

    await repo.findByTeamProvider("22222222-2222-2222-2222-222222222222", "toconline");
    await repo.update("cred-1", record());

    expect(admin.patches).toHaveLength(1);
    const patch = admin.patches[0]!;
    expect(patch.status).toBe("active");
    expect(patch.metadata).toEqual({ lastVerifiedBy: "worker" });
    expect(patch.secret_encrypted).toBe("cifrado");
  });

  /**
   * A regressão que este teste tranca: o `update` chegou a ler o estado de uma
   * variável que só o `findByTeamProvider` preenchia. Chamado sem ele, escrevia
   * `metadata: {}` — o apagão que esta mudança existe para eliminar.
   */
  it("relê a linha quando o `update` é chamado sem leitura prévia", async () => {
    const admin = fakeAdmin(invalidRow);
    const repo = credentialRepo(admin);

    await repo.update("cred-1", record());

    expect(admin.selects).toEqual(["status, metadata"]);
    expect(admin.patches[0]?.metadata).toEqual({ lastVerifiedBy: "worker" });
    expect(admin.patches[0]?.status).toBe("active");
  });

  it("não relê o que já leu", async () => {
    const admin = fakeAdmin(invalidRow);
    const repo = credentialRepo(admin);

    await repo.findByTeamProvider("22222222-2222-2222-2222-222222222222", "toconline");
    await repo.update("cred-1", record());

    expect(admin.selects).toEqual(["id, secret_encrypted, status, metadata"]);
  });

  it("sem senha nova não toca no segredo, no estado nem no metadata", async () => {
    const admin = fakeAdmin(invalidRow);
    const repo = credentialRepo(admin);

    await repo.findByTeamProvider("22222222-2222-2222-2222-222222222222", "toconline");
    await repo.update("cred-1", record({ secretEncrypted: null }));

    const patch = admin.patches[0]!;
    expect(patch).not.toHaveProperty("secret_encrypted");
    expect(patch).not.toHaveProperty("status");
    expect(patch).not.toHaveProperty("metadata");
    // O que o formulário mudou continua a ser gravado.
    expect(patch.username).toBe("gabinete@example.pt");
  });

  it("uma credencial já ativa não reescreve o estado, mas limpa o metadata", async () => {
    const admin = fakeAdmin({ ...invalidRow, status: "active" });
    const repo = credentialRepo(admin);

    await repo.findByTeamProvider("22222222-2222-2222-2222-222222222222", "toconline");
    await repo.update("cred-1", record());

    const patch = admin.patches[0]!;
    expect(patch).not.toHaveProperty("status");
    expect(patch.metadata).toEqual({ lastVerifiedBy: "worker" });
  });

  it("uma linha sem metadata guardado não rebenta", async () => {
    const admin = fakeAdmin({
      id: "cred-1",
      secret_encrypted: null,
      status: "invalid",
      metadata: null,
    });
    const repo = credentialRepo(admin);

    await repo.update("cred-1", record());

    expect(admin.patches[0]?.metadata).toEqual({});
    expect(admin.patches[0]?.status).toBe("active");
  });
});
