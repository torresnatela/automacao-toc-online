import { describe, it, expect } from "vitest";
import {
  createCompany,
  updateCompany,
  type CompanyRepo,
  type CompanyInput,
  type CompanyRecord,
} from "../src/domain/index";

function makeRepo(overrides: Partial<CompanyRepo> = {}) {
  const calls = {
    insert: [] as CompanyRecord[],
    update: [] as Array<{ id: string; record: CompanyRecord }>,
    findByNiss: [] as number[],
  };
  const repo: CompanyRepo = {
    async findByNiss(_teamId, niss) {
      calls.findByNiss.push(niss);
      return null;
    },
    async insert(record) {
      calls.insert.push(record);
      return { id: "company-1" };
    },
    async update(id, record) {
      calls.update.push({ id, record });
      return { found: true };
    },
    ...overrides,
  };
  return { repo, calls };
}

function input(overrides: Partial<CompanyInput> = {}): CompanyInput {
  return {
    teamId: "team-1",
    niss: "12345678901",
    name: "Padaria Central Lda",
    type: "employer",
    ...overrides,
  };
}

describe("createCompany", () => {
  it("normaliza e insere, retornando o id", async () => {
    const { repo, calls } = makeRepo();

    const out = await createCompany(repo, input({ country: "pt", nif: " 500000000 " }));

    expect(out).toEqual({ ok: true, id: "company-1" });
    expect(calls.insert).toHaveLength(1);
    const rec = calls.insert[0]!;
    expect(rec.niss).toBe(12345678901); // string → número
    expect(rec.status).toBe("active"); // default
    expect(rec.country).toBe("PT"); // uppercased + default
    expect(rec.nif).toBe("500000000"); // trim
  });

  it("rejeita entrada inválida sem tocar no repo", async () => {
    const { repo, calls } = makeRepo();

    const out = await createCompany(repo, input({ niss: "123" }));

    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.fieldErrors?.niss).toBeTruthy();
    expect(calls.findByNiss).toHaveLength(0);
    expect(calls.insert).toHaveLength(0);
  });

  it("rejeita NISS duplicado", async () => {
    const { repo, calls } = makeRepo({
      async findByNiss() {
        return { id: "existente" };
      },
    });

    const out = await createCompany(repo, input());

    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.fieldErrors?.niss).toBeTruthy();
    expect(calls.insert).toHaveLength(0);
  });
});

describe("updateCompany", () => {
  it("atualiza quando válido", async () => {
    const { repo, calls } = makeRepo();

    const out = await updateCompany(repo, "company-9", input());

    expect(out).toEqual({ ok: true, id: "company-9" });
    expect(calls.update).toHaveLength(1);
    expect(calls.update[0]!.id).toBe("company-9");
  });

  it("permite manter o próprio NISS (mesmo id)", async () => {
    const { repo, calls } = makeRepo({
      async findByNiss() {
        return { id: "company-9" };
      },
    });

    const out = await updateCompany(repo, "company-9", input());

    expect(out.ok).toBe(true);
    expect(calls.update).toHaveLength(1);
  });

  it("rejeita NISS pertencente a outra empresa", async () => {
    const { repo, calls } = makeRepo({
      async findByNiss() {
        return { id: "outra-empresa" };
      },
    });

    const out = await updateCompany(repo, "company-9", input());

    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.fieldErrors?.niss).toBeTruthy();
    expect(calls.update).toHaveLength(0);
  });

  it("retorna erro quando a empresa não existe (update casou 0 linhas)", async () => {
    const { repo } = makeRepo({
      async update() {
        return { found: false };
      },
    });

    const out = await updateCompany(repo, "inexistente", input());

    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toBeTruthy();
  });
});
