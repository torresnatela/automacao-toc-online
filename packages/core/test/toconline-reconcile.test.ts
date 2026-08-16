import { describe, it, expect } from "vitest";
import { planCompanyReconciliation } from "../src/domain/toconline/reconcile";
import type {
  ExistingCompany,
  ReconcileAction,
  ScannedCompany,
} from "../src/domain/toconline/types";

const NIF_A = "501442600";
const NIF_B = "502011378";

function scanned(over: Partial<ScannedCompany> = {}): ScannedCompany {
  return {
    tocCompanyId: 515814,
    nif: NIF_A,
    name: "Empresa Exemplo, Lda",
    cluster: 5,
    active: true,
    demo: false,
    accounting: true,
    roles: "Contabilista responsável",
    ...over,
  };
}

function existing(over: Partial<ExistingCompany> = {}): ExistingCompany {
  return {
    id: "uuid-1",
    nif: NIF_A,
    name: "Empresa Exemplo, Lda",
    status: "active",
    tocCompanyId: 515814,
    tocCluster: 5,
    ...over,
  };
}

/** Aplica um plano ao estado local — usado para provar idempotência. */
function apply(before: ExistingCompany[], actions: ReconcileAction[]): ExistingCompany[] {
  const after = before.map((c) => ({ ...c }));
  let seq = after.length;

  for (const action of actions) {
    if (action.kind === "create") {
      seq += 1;
      after.push({
        id: `uuid-novo-${seq}`,
        nif: action.entry.nif,
        name: action.entry.name,
        status: action.entry.active ? "active" : "inactive",
        tocCompanyId: action.entry.tocCompanyId,
        tocCluster: action.entry.cluster,
      });
    } else if (action.kind === "link" || action.kind === "update") {
      const target = after.find((c) => c.id === action.companyId);
      if (target) Object.assign(target, action.changes);
    }
  }
  return after;
}

describe("planCompanyReconciliation", () => {
  describe("correspondência pelo id do TOConline", () => {
    it("sem diferenças → unchanged", () => {
      const plan = planCompanyReconciliation([scanned()], [existing()]);
      expect(plan.actions).toEqual([
        { kind: "unchanged", companyId: "uuid-1", entry: scanned() },
      ]);
    });

    it("nome mudou → update só com o campo que mudou", () => {
      const plan = planCompanyReconciliation([scanned({ name: "Novo Nome, Lda" })], [existing()]);
      expect(plan.actions[0]).toMatchObject({
        kind: "update",
        companyId: "uuid-1",
        changes: { name: "Novo Nome, Lda" },
      });
      expect(plan.actions[0]).not.toHaveProperty("changes.nif");
    });

    it("empresa desativada no TOConline → update do status", () => {
      const plan = planCompanyReconciliation([scanned({ active: false })], [existing()]);
      expect(plan.actions[0]).toMatchObject({ kind: "update", changes: { status: "inactive" } });
    });

    it("cluster mudou (empresa migrada de shard) → update", () => {
      const plan = planCompanyReconciliation([scanned({ cluster: 11 })], [existing()]);
      expect(plan.actions[0]).toMatchObject({ kind: "update", changes: { tocCluster: 11 } });
    });

    it("casa pelo id mesmo quando o NIF local diverge", () => {
      const plan = planCompanyReconciliation([scanned()], [existing({ nif: NIF_B })]);
      expect(plan.actions[0]).toMatchObject({ kind: "update", changes: { nif: NIF_A } });
    });
  });

  describe("correspondência pelo NIF (adoção de cadastro manual)", () => {
    it("empresa criada à mão, sem id do TOConline → link", () => {
      const local = existing({ tocCompanyId: null, tocCluster: null });
      const plan = planCompanyReconciliation([scanned()], [local]);
      expect(plan.actions[0]).toMatchObject({
        kind: "link",
        companyId: "uuid-1",
        changes: { tocCompanyId: 515814, tocCluster: 5 },
      });
    });

    it("o link também corrige o nome quando diverge", () => {
      const local = existing({ tocCompanyId: null, tocCluster: null, name: "Nome Antigo" });
      const plan = planCompanyReconciliation([scanned()], [local]);
      expect(plan.actions[0]).toMatchObject({
        kind: "link",
        changes: { name: "Empresa Exemplo, Lda" },
      });
    });

    it("NIF já ligado a OUTRA empresa do TOConline → conflict, nunca resolver sozinho", () => {
      const local = existing({ tocCompanyId: 999999 });
      const plan = planCompanyReconciliation([scanned()], [local]);
      expect(plan.actions).toEqual([
        {
          kind: "conflict",
          companyId: "uuid-1",
          entry: scanned(),
          reason: "nif_ligado_a_outra",
        },
      ]);
    });

    it("empresa sem NIF nunca casa por NIF — só por id", () => {
      const local = existing({ tocCompanyId: null, tocCluster: null, nif: null });
      const plan = planCompanyReconciliation([scanned({ nif: null })], [local]);
      expect(plan.actions[0]?.kind).toBe("create");
    });
  });

  it("sem correspondência → create", () => {
    const plan = planCompanyReconciliation([scanned()], []);
    expect(plan.actions).toEqual([{ kind: "create", entry: scanned() }]);
  });

  it("empresa demo → skip, sem tocar na base", () => {
    const plan = planCompanyReconciliation([scanned({ demo: true })], []);
    expect(plan.actions).toEqual([{ kind: "skip", entry: scanned({ demo: true }), reason: "demo" }]);
  });

  it("empresa sem módulo de contabilidade entra na mesma", () => {
    const plan = planCompanyReconciliation([scanned({ accounting: false })], []);
    expect(plan.actions[0]?.kind).toBe("create");
  });

  describe("empresas que sumiram do TOConline", () => {
    it("estava ligada e não veio na varredura → missing (nunca apagar)", () => {
      const plan = planCompanyReconciliation([], [existing()]);
      expect(plan.actions).toEqual([{ kind: "missing", companyId: "uuid-1" }]);
    });

    it("cadastro manual sem id do TOConline fica fora do plano", () => {
      const local = existing({ tocCompanyId: null, tocCluster: null });
      const plan = planCompanyReconciliation([], [local]);
      expect(plan.actions).toEqual([]);
    });

    it("uma demo ignorada não faz a empresa local parecer desaparecida", () => {
      const plan = planCompanyReconciliation([scanned({ demo: true })], [existing()]);
      expect(plan.actions.map((a) => a.kind)).toEqual(["skip"]);
    });
  });

  describe("resumo", () => {
    it("conta cada tipo de ação e o total de entradas", () => {
      const plan = planCompanyReconciliation(
        [
          scanned({ tocCompanyId: 1, nif: NIF_A }),
          scanned({ tocCompanyId: 2, nif: NIF_B, name: "Outro" }),
          scanned({ tocCompanyId: 3, nif: null, demo: true }),
        ],
        [existing({ id: "u1", tocCompanyId: 1, nif: NIF_A }), existing({ id: "u9", tocCompanyId: 9 })],
      );

      expect(plan.summary).toEqual({
        total: 3,
        create: 1,
        link: 0,
        update: 0,
        unchanged: 1,
        skip: 1,
        conflict: 0,
        missing: 1,
      });
      expect(plan.actions).toHaveLength(4); // 3 entradas + 1 desaparecida
    });
  });

  it("é idempotente: replanear sobre o resultado não produz mudanças", () => {
    const entries = [
      scanned({ tocCompanyId: 1, nif: NIF_A }),
      scanned({ tocCompanyId: 2, nif: NIF_B, name: "Segunda, Lda", cluster: 8, active: false }),
    ];
    const before: ExistingCompany[] = [
      existing({ id: "u1", tocCompanyId: null, tocCluster: null, nif: NIF_A, name: "Antigo" }),
    ];

    const first = planCompanyReconciliation(entries, before);
    expect(first.summary).toMatchObject({ link: 1, create: 1 });

    const after = apply(before, first.actions);
    const second = planCompanyReconciliation(entries, after);

    expect(second.summary).toMatchObject({
      unchanged: 2,
      create: 0,
      link: 0,
      update: 0,
      conflict: 0,
      missing: 0,
    });
  });

  it("não inventa correspondências entre entradas distintas", () => {
    const plan = planCompanyReconciliation(
      [scanned({ tocCompanyId: 1, nif: NIF_A }), scanned({ tocCompanyId: 2, nif: NIF_B })],
      [existing({ id: "u1", tocCompanyId: 1, nif: NIF_A })],
    );
    const kinds = plan.actions.map((a) => a.kind).sort();
    expect(kinds).toEqual(["create", "unchanged"]);
  });
});
