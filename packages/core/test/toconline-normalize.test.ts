import { describe, it, expect } from "vitest";
import { normalizeScan, persistableCompanies } from "../src/domain/toconline/normalize";
import type { RawTocCompany } from "../src/domain/toconline/types";

// NIFs sintéticos com dígito de controlo válido (nunca dados reais de clientes).
const NIF_A = "501442600";
const NIF_B = "502011378";

function raw(over: Partial<RawTocCompany> = {}): RawTocCompany {
  return {
    id: 515814,
    tax_number: NIF_A,
    name: "Empresa Exemplo, Lda",
    cluster: 5,
    status: "active",
    demo: false,
    accounting: true,
    roles: "Contabilista responsável",
    ...over,
  };
}

describe("normalizeScan", () => {
  it("normaliza uma linha completa", () => {
    const scan = normalizeScan([raw()]);
    expect(scan.rejected).toEqual([]);
    expect(scan.warnings).toEqual([]);
    expect(scan.companies[0]).toEqual({
      tocCompanyId: 515814,
      nif: NIF_A,
      name: "Empresa Exemplo, Lda",
      cluster: 5,
      active: true,
      demo: false,
      accounting: true,
      roles: "Contabilista responsável",
    });
  });

  it("aceita id em string numérica (o grid nem sempre é consistente)", () => {
    expect(normalizeScan([raw({ id: "515814" })]).companies[0]?.tocCompanyId).toBe(515814);
  });

  it("colapsa espaços do nome", () => {
    expect(normalizeScan([raw({ name: "  Alfa   Beta  " })]).companies[0]?.name).toBe("Alfa Beta");
  });

  it("limpa pontuação do NIF antes de validar", () => {
    expect(normalizeScan([raw({ tax_number: " 501 442 600 " })]).companies[0]?.nif).toBe(NIF_A);
  });

  describe("mapeamento de estado", () => {
    it("status active → active: true", () => {
      expect(normalizeScan([raw({ status: "active" })]).companies[0]?.active).toBe(true);
    });

    it("qualquer outro status → active: false (importa na mesma)", () => {
      const scan = normalizeScan([raw({ status: "inactive" })]);
      expect(scan.companies).toHaveLength(1);
      expect(scan.companies[0]?.active).toBe(false);
    });
  });

  describe("descartes (linha inutilizável)", () => {
    it("id não numérico → id_invalido", () => {
      const scan = normalizeScan([raw({ id: "abc" })]);
      expect(scan.companies).toEqual([]);
      expect(scan.rejected).toEqual([{ tocCompanyId: null, reason: "id_invalido" }]);
    });

    it("id ausente ou não positivo → id_invalido", () => {
      for (const id of [undefined, null, 0, -1]) {
        expect(normalizeScan([raw({ id })]).rejected[0]?.reason).toBe("id_invalido");
      }
    });

    it("nome vazio → nome_ausente, preservando o id para diagnóstico", () => {
      const scan = normalizeScan([raw({ name: "   " })]);
      expect(scan.companies).toEqual([]);
      expect(scan.rejected).toEqual([{ tocCompanyId: 515814, reason: "nome_ausente" }]);
    });
  });

  describe("ressalvas de NIF (importa na mesma, com nif nulo)", () => {
    // 501442601 = NIF_A com o dígito de controlo trocado. (Cuidado ao escolher
    // exemplos: 123456789 parece inválido mas passa o mod-11.)
    it("NIF com dígito de controlo errado → nif_invalido", () => {
      const scan = normalizeScan([raw({ tax_number: "501442601" })]);
      expect(scan.companies[0]?.nif).toBeNull();
      expect(scan.warnings).toEqual([{ tocCompanyId: 515814, reason: "nif_invalido" }]);
    });

    it("NIF com menos de 9 dígitos → nif_invalido", () => {
      expect(normalizeScan([raw({ tax_number: "50144260" })]).warnings[0]?.reason).toBe(
        "nif_invalido",
      );
    });

    it("NIF ausente ou vazio → nif_ausente", () => {
      for (const tax of [undefined, null, "", "   "]) {
        const scan = normalizeScan([raw({ tax_number: tax })]);
        expect(scan.companies).toHaveLength(1);
        expect(scan.companies[0]?.nif).toBeNull();
        expect(scan.warnings[0]?.reason).toBe("nif_ausente");
      }
    });

    it("NIF repetido na mesma varredura: a primeira fica, a segunda perde o NIF", () => {
      const scan = normalizeScan([raw({ id: 1001 }), raw({ id: 1002 })]);
      expect(scan.companies).toHaveLength(2);
      expect(scan.companies[0]?.nif).toBe(NIF_A);
      expect(scan.companies[1]?.nif).toBeNull();
      expect(scan.warnings).toEqual([{ tocCompanyId: 1002, reason: "nif_duplicado" }]);
    });
  });

  it("nunca lança — classifica tudo, inclusive lixo total", () => {
    const scan = normalizeScan([{} as RawTocCompany, null as unknown as RawTocCompany]);
    expect(scan.companies).toEqual([]);
    expect(scan.rejected).toHaveLength(2);
  });

  it("não deixa nome nem NIF entrar nas ressalvas ou descartes", () => {
    const scan = normalizeScan([raw({ name: "  " }), raw({ id: 999, tax_number: "123456789" })]);
    const dump = JSON.stringify([...scan.warnings, ...scan.rejected]);
    expect(dump).not.toContain("Empresa Exemplo");
    expect(dump).not.toContain(NIF_A);
  });

  it("preserva a ordem do grid", () => {
    const scan = normalizeScan([raw({ id: 3 }), raw({ id: 1, tax_number: NIF_B }), raw({ id: 2 })]);
    expect(scan.companies.map((c) => c.tocCompanyId)).toEqual([3, 1, 2]);
  });
});

describe("persistableCompanies", () => {
  it("exclui as empresas demo e só essas", () => {
    const scan = normalizeScan([
      raw({ id: 1, tax_number: NIF_A }),
      raw({ id: 2, tax_number: NIF_B, demo: true }),
      raw({ id: 3, tax_number: null }),
    ]);
    expect(persistableCompanies(scan).map((c) => c.tocCompanyId)).toEqual([1, 3]);
  });

  it("não exclui por módulo de contabilidade — isso é decisão de quem consome", () => {
    const scan = normalizeScan([raw({ accounting: false })]);
    expect(persistableCompanies(scan)).toHaveLength(1);
  });

  it("não exclui inativas — perder uma faria a carteira ficar incompleta", () => {
    const scan = normalizeScan([raw({ status: "inactive" })]);
    expect(persistableCompanies(scan)).toHaveLength(1);
  });
});
