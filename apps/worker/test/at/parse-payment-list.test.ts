import { describe, expect, it } from "vitest";
import { parsePaymentRows, pickMostRecentPayment } from "../../src/at/parse-payment-list";

/**
 * A tabela de `obter-doc-pagamento` da AT, lida como dados (cabeçalhos e linhas
 * observados no reconhecimento de 2026-09-07). Puro: a leitura do DOM fica no
 * adaptador. O que importa provar: o período canónico sai do ANO (do filtro) +
 * o trimestre da linha, as colunas localizam-se pelo TEXTO do cabeçalho, e a
 * linha certa é a mais recente por data de receção — com o índice, para o
 * adaptador clicar no link daquela linha.
 */

const HEADER = ["Identificação", "Período", "Data de receção", ""];

describe("parsePaymentRows", () => {
  it("combina o ano do filtro com o trimestre da linha num período canónico", () => {
    const linhas = [
      ["240012345678", "3T", "2026-09-02 10:11:12", "Obter documento de pagamento"],
      ["240012000000", "2T", "2026-06-01 09:00:00", "Obter documento de pagamento"],
    ];
    expect(parsePaymentRows(HEADER, linhas, "2026")).toEqual([
      { period: "2026-Q3", receivedAt: "2026-09-02 10:11:12", rowIndex: 0 },
      { period: "2026-Q2", receivedAt: "2026-06-01 09:00:00", rowIndex: 1 },
    ]);
  });

  it("localiza as colunas pelo cabeçalho, não pelo índice", () => {
    const header = ["Período", "Data de receção", "Identificação", ""];
    const linhas = [["1T", "2026-04-10 08:00:00", "240099999999", "Obter documento de pagamento"]];
    expect(parsePaymentRows(header, linhas, "2026")).toEqual([
      { period: "2026-Q1", receivedAt: "2026-04-10 08:00:00", rowIndex: 0 },
    ]);
  });

  it("ignora linhas sem período legível, mantendo o índice das restantes", () => {
    const linhas = [
      ["", "", "", "Sem resultados"],
      ["240012345678", "4T", "2026-12-15 10:00:00", "Obter documento de pagamento"],
    ];
    expect(parsePaymentRows(HEADER, linhas, "2026")).toEqual([
      { period: "2026-Q4", receivedAt: "2026-12-15 10:00:00", rowIndex: 1 },
    ]);
  });

  it("lança quando o cabeçalho não tem coluna de período", () => {
    expect(() => parsePaymentRows(["Identificação", "Data de receção"], [], "2026")).toThrow(
      /per[íi]odo/i,
    );
  });
});

describe("pickMostRecentPayment", () => {
  it("escolhe a de data de receção mais recente", () => {
    const rows = [
      { period: "2026-Q2", receivedAt: "2026-06-01 09:00:00", rowIndex: 1 },
      { period: "2026-Q3", receivedAt: "2026-09-02 10:11:12", rowIndex: 0 },
    ];
    expect(pickMostRecentPayment(rows)?.period).toBe("2026-Q3");
  });

  it("devolve null quando não há linhas", () => {
    expect(pickMostRecentPayment([])).toBeNull();
  });
});
