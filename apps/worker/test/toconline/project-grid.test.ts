import { describe, it, expect } from "vitest";
import { projectGrid } from "../../src/toconline/project-grid";

/** Um `vaadin-grid` de mentira. Só precisa das propriedades que projectGrid lê. */
function grid(props: Record<string, unknown>): Record<string, unknown> {
  return props;
}

const item = (over: Record<string, unknown> = {}) => ({
  id: 515814,
  tax_number: "501442600",
  name: "Empresa Exemplo, Lda",
  cluster: 5,
  status: "active",
  i18n_status: "Ativa",
  demo: false,
  accounting: true,
  roles: "Contabilista responsável",
  // Markup por linha: pesado e cheio de dados do cliente. Nunca deve sair do browser.
  _csHTML: "<div class='row'>Empresa Exemplo, Lda</div>",
  ...over,
});

describe("projectGrid", () => {
  it("lê a propriedade items", () => {
    const result = projectGrid(grid({ items: [item(), item({ id: 2 })], size: 2 }));
    expect(result.via).toBe("items");
    expect(result.rows).toHaveLength(2);
    expect(result.reportedSize).toBe(2);
  });

  it("cai para __data.items quando items não existe (bag do Polymer)", () => {
    const result = projectGrid(grid({ __data: { items: [item()] } }));
    expect(result.via).toBe("polymer_data");
    expect(result.rows).toHaveLength(1);
  });

  it("cai para _items em último recurso", () => {
    const result = projectGrid(grid({ _items: [item()] }));
    expect(result.via).toBe("legacy_items");
    expect(result.rows).toHaveLength(1);
  });

  it("via none quando nenhuma fonte é um array", () => {
    const result = projectGrid(grid({ items: null, __data: {}, size: 182 }));
    expect(result.via).toBe("none");
    expect(result.rows).toEqual([]);
    // O tamanho anunciado ainda serve de diagnóstico: "dizia 182 e não veio nada".
    expect(result.reportedSize).toBe(182);
  });

  it("projeta exatamente os campos que usamos", () => {
    const [row] = projectGrid(grid({ items: [item()] })).rows;
    expect(Object.keys(row as object).sort()).toEqual(
      ["accounting", "cluster", "demo", "id", "i18n_status", "name", "roles", "status", "tax_number"].sort(),
    );
  });

  it("nunca traz _csHTML para fora do browser", () => {
    const result = projectGrid(grid({ items: [item()] }));
    expect(JSON.stringify(result)).not.toContain("_csHTML");
    expect(JSON.stringify(result)).not.toContain("<div");
  });

  it("não coage valores — a validação é do domínio, não da projeção", () => {
    const [row] = projectGrid(grid({ items: [item({ id: "abc", demo: "sim" })] })).rows;
    expect(row?.id).toBe("abc");
    expect(row?.demo).toBe("sim");
  });

  describe("tamanho anunciado", () => {
    it("usa size quando é número", () => {
      expect(projectGrid(grid({ items: [], size: 182 })).reportedSize).toBe(182);
    });

    it("cai para _effectiveSize", () => {
      expect(projectGrid(grid({ items: [], _effectiveSize: 182 })).reportedSize).toBe(182);
    });

    it("null quando nenhum existe", () => {
      expect(projectGrid(grid({ items: [] })).reportedSize).toBeNull();
    });
  });

  it("sobrevive a linhas nulas sem lançar", () => {
    const result = projectGrid(grid({ items: [null, item(), undefined] }));
    expect(result.rows).toHaveLength(3);
  });

  /**
   * O Playwright serializa esta função com `toString()` e avalia-a DENTRO do
   * browser. Se o transpilador injetar um helper (`__name`, `import_x`,
   * coverage), a função parte-se lá dentro com um sintoma obscuro — um
   * ReferenceError sem stack útil. Este teste sela a restrição.
   */
  it("é auto-contida: nenhuma referência a escopo de módulo", () => {
    const source = projectGrid.toString();
    expect(source).not.toMatch(/\brequire\b/);
    expect(source).not.toMatch(/import_/);
    expect(source).not.toMatch(/__name\(/);
    expect(source).not.toMatch(/cov_/);
  });
});
