import { describe, it, expect } from "vitest";
import { parseFieldsFromText } from "../../src/at/parse-fields";

describe("parseFieldsFromText", () => {
  it("lê a guia como ela aparece no HTML do portal", () => {
    const fields = parseFieldsFromText(
      [
        "Documento de pagamento",
        "NIF: 501234567",
        "Período: 2026-07",
        "Entidade: 10800",
        "Referência: 123 456 789 012 345",
        "Valor: 1.234,56 €",
      ].join("\n"),
    );
    expect(fields).toEqual({
      period: "2026-07",
      entity: "10800",
      reference: "123 456 789 012 345",
      amount: "1.234,56",
      nif: "501234567",
      source: "html",
    });
  });

  it("aceita as variantes de rótulo do valor", () => {
    expect(parseFieldsFromText("Montante a pagar: 87,00 €").amount).toBe("87,00");
    expect(parseFieldsFromText("Importância: 1.000.000,00 €").amount).toBe("1.000.000,00");
  });

  it("lê o texto extraído de um PDF, em que o rótulo e o valor ficam em linhas diferentes", () => {
    const fields = parseFieldsFromText(
      ["Entidade", "10800", "Referência", "123 456 789 012 345", "Valor", "1.234,56"].join("\n"),
    );
    expect(fields.entity).toBe("10800");
    expect(fields.reference).toBe("123 456 789 012 345");
    expect(fields.amount).toBe("1.234,56");
  });

  it("não inventa o que não está lá", () => {
    // Sem entidade continua a haver guia — o campo em falta é `null`, e é o
    // runner que decide se `fetched_without_fields` chega.
    const fields = parseFieldsFromText("Referência: 123 456 789 012 345\nValor: 87,00 €");
    expect(fields.entity).toBe(null);
    expect(fields.nif).toBe(null);
    expect(fields.period).toBe(null);
    expect(fields.source).toBe("html");
  });

  it("um texto sem campo nenhum diz que não veio de lado nenhum", () => {
    expect(parseFieldsFromText("Bem-vindo à sua área reservada.")).toEqual({
      period: null,
      entity: null,
      reference: null,
      amount: null,
      nif: null,
      source: "none",
    });
  });

  it("um texto vazio não rebenta", () => {
    expect(parseFieldsFromText("").source).toBe("none");
  });

  it("apara a referência sem lhe tirar os espaços que a AT imprime", () => {
    // Os espaços fazem parte da forma como a referência é lida em voz alta e
    // conferida à mão; normalizá-los é decisão do domínio, não deste parser.
    expect(parseFieldsFromText("Referencia:  123 456 789 012 345  \nValor: 1,00").reference).toBe(
      "123 456 789 012 345",
    );
  });

  it("o período fica como o portal o escreveu, para o domínio canonizar", () => {
    expect(parseFieldsFromText("Período: 3.º trimestre de 2026").period).toBe(
      "3.º trimestre de 2026",
    );
  });
});
