import { describe, it, expect } from "vitest";
import { assertScanIntegrity } from "../../src/toconline/guards";
import { StructuralError } from "../../src/errors";
import type { GridProjection } from "../../src/toconline/project-grid";
import type { CompanyScan, ScannedCompany } from "@toc/core/domain";

function read(over: Partial<GridProjection> = {}): GridProjection {
  return { rows: new Array(182).fill({}), reportedSize: 182, via: "items", ...over };
}

function company(id: number): ScannedCompany {
  return {
    tocCompanyId: id,
    nif: null,
    name: `Empresa ${id}`,
    cluster: 5,
    active: true,
    demo: false,
    accounting: true,
    roles: null,
  };
}

function scan(over: Partial<CompanyScan> = {}): CompanyScan {
  return {
    companies: Array.from({ length: 182 }, (_, i) => company(i + 1)),
    warnings: [],
    rejected: [],
    ...over,
  };
}

describe("assertScanIntegrity", () => {
  it("não lança numa varredura saudável", () => {
    expect(() => assertScanIntegrity(read(), scan(), 182)).not.toThrow();
  });

  it("não lança na primeira varredura (sem baseline)", () => {
    expect(() => assertScanIntegrity(read(), scan(), 0)).not.toThrow();
  });

  it("1: a propriedade do grid desapareceu", () => {
    expect(() => assertScanIntegrity(read({ via: "none", rows: [] }), scan({ companies: [] }), 0)).toThrow(
      StructuralError,
    );
  });

  it("2: grid presente mas vazio", () => {
    expect(() => assertScanIntegrity(read({ rows: [] }), scan({ companies: [] }), 0)).toThrow(
      StructuralError,
    );
  });

  // O modo de falha mais perigoso: ler no meio do stream do WebSocket.
  it("3: leitura truncada — o grid diz 182 e vieram 60", () => {
    expect(() =>
      assertScanIntegrity(
        read({ rows: new Array(60).fill({}), reportedSize: 182 }),
        scan({ companies: Array.from({ length: 60 }, (_, i) => company(i)) }),
        0,
      ),
    ).toThrow(/60.*182|182.*60/);
  });

  it("3: não se pronuncia quando o grid não anuncia tamanho", () => {
    expect(() =>
      assertScanIntegrity(read({ reportedSize: null }), scan(), 182),
    ).not.toThrow();
  });

  describe("4: encolhimento anómalo face à varredura anterior", () => {
    it("lança quando cai abaixo de 80%", () => {
      const rows = new Array(100).fill({});
      expect(() =>
        assertScanIntegrity(
          read({ rows, reportedSize: 100 }),
          scan({ companies: Array.from({ length: 100 }, (_, i) => company(i)) }),
          182,
        ),
      ).toThrow(StructuralError);
    });

    it("tolera uma queda pequena — clientes saem do gabinete", () => {
      const rows = new Array(179).fill({});
      expect(() =>
        assertScanIntegrity(
          read({ rows, reportedSize: 179 }),
          scan({ companies: Array.from({ length: 179 }, (_, i) => company(i)) }),
          182,
        ),
      ).not.toThrow();
    });

    it("nunca se queixa de crescimento", () => {
      const rows = new Array(300).fill({});
      expect(() =>
        assertScanIntegrity(
          read({ rows, reportedSize: 300 }),
          scan({ companies: Array.from({ length: 300 }, (_, i) => company(i)) }),
          182,
        ),
      ).not.toThrow();
    });
  });

  it("5: havia linhas mas nenhuma sobreviveu — o contrato de campos mudou", () => {
    expect(() => assertScanIntegrity(read(), scan({ companies: [] }), 0)).toThrow(StructuralError);
  });

  it("6: mais de metade das linhas descartadas", () => {
    const rejected = Array.from({ length: 100 }, (_, i) => ({
      tocCompanyId: i,
      reason: "nome_ausente" as const,
    }));
    expect(() =>
      assertScanIntegrity(read(), scan({ companies: [company(1)], rejected }), 0),
    ).toThrow(StructuralError);
  });

  // Se `tax_number` for renomeado, as linhas não são descartadas — ficam todas
  // com NIF nulo. Sem esta guarda, a varredura "teria sucesso" e apagaria o NIF
  // de meia carteira.
  it("7: mais de metade das linhas perdeu o NIF", () => {
    const warnings = Array.from({ length: 120 }, (_, i) => ({
      tocCompanyId: i,
      reason: "nif_ausente" as const,
    }));
    expect(() => assertScanIntegrity(read(), scan({ warnings }), 0)).toThrow(StructuralError);
  });

  it("7: tolera uma minoria sem NIF (entidades estrangeiras existem)", () => {
    const warnings = Array.from({ length: 3 }, (_, i) => ({
      tocCompanyId: i,
      reason: "nif_invalido" as const,
    }));
    expect(() => assertScanIntegrity(read(), scan({ warnings }), 0)).not.toThrow();
  });

  it("as mensagens não expõem nomes nem NIFs de clientes", () => {
    try {
      assertScanIntegrity(read({ rows: new Array(60).fill({}) }), scan(), 182);
    } catch (err) {
      expect((err as Error).message).not.toContain("Empresa ");
    }
  });
});
