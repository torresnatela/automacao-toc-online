import { describe, it, expect } from "vitest";
import {
  createTeam,
  updateTeam,
  type TeamRepo,
  type TeamInput,
  type TeamRecord,
} from "../src/domain/index";

function makeRepo(overrides: Partial<TeamRepo> = {}) {
  const calls = {
    insert: [] as TeamRecord[],
    update: [] as Array<{ id: string; record: TeamRecord }>,
  };
  const repo: TeamRepo = {
    async insert(record) {
      calls.insert.push(record);
      return { id: "team-1" };
    },
    async update(id, record) {
      calls.update.push({ id, record });
    },
    ...overrides,
  };
  return { repo, calls };
}

function input(overrides: Partial<TeamInput> = {}): TeamInput {
  return { name: "Gabinete Silva", ...overrides };
}

describe("createTeam", () => {
  it("normaliza e insere, retornando o id", async () => {
    const { repo, calls } = makeRepo();

    const out = await createTeam(repo, input({ name: "  Gabinete Silva  ", nif: " 501234567 " }));

    expect(out).toEqual({ ok: true, id: "team-1" });
    expect(calls.insert).toHaveLength(1);
    expect(calls.insert[0]!.name).toBe("Gabinete Silva");
    expect(calls.insert[0]!.nif).toBe("501234567");
    expect(calls.insert[0]!.status).toBe("active"); // default
  });

  it("rejeita entrada inválida sem tocar no repo", async () => {
    const { repo, calls } = makeRepo();

    const out = await createTeam(repo, input({ name: "" }));

    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.fieldErrors?.name).toBeTruthy();
    expect(calls.insert).toHaveLength(0);
  });
});

describe("updateTeam", () => {
  it("atualiza quando válido", async () => {
    const { repo, calls } = makeRepo();

    const out = await updateTeam(repo, "team-9", input());

    expect(out).toEqual({ ok: true, id: "team-9" });
    expect(calls.update[0]!.id).toBe("team-9");
  });
});
