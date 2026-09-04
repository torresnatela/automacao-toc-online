import { describe, it, expect } from "vitest";
import {
  documentFieldsComplete,
  normalizeDocumentFields,
  taxIdMatches,
} from "../src/domain/at/document";
import type { RawDocumentFields } from "../src/domain/at/document";

// Valores sintéticos: nunca dados reais de clientes.
const ENTITY = "10541";
const REFERENCE = "123456789012345";
const NIF = "501442600";

function raw(over: Partial<RawDocumentFields> = {}): RawDocumentFields {
  return { entity: ENTITY, reference: REFERENCE, amount: "1.234,56 €", ...over };
}

describe("normalizeDocumentFields", () => {
  it("lê os três campos de uma guia completa sem ressalvas", () => {
    expect(normalizeDocumentFields(raw())).toEqual({
      entity: ENTITY,
      reference: REFERENCE,
      amount: "1234.56",
      warnings: [],
    });
  });

  it("aceita a referência com espaços e pontos do PDF", () => {
    expect(normalizeDocumentFields(raw({ reference: "123 456 789 012 345" })).reference).toBe(
      REFERENCE,
    );
    expect(normalizeDocumentFields(raw({ reference: "123.456.789.012.345" })).reference).toBe(
      REFERENCE,
    );
  });

  it("referência com 14 dígitos é inválida (null + ressalva)", () => {
    const fields = normalizeDocumentFields(raw({ reference: "12345678901234" }));
    expect(fields.reference).toBeNull();
    expect(fields.warnings).toContain("referencia_invalida");
  });

  it("entidade ausente dá entidade_ausente; entidade com outro tamanho dá entidade_invalida", () => {
    expect(normalizeDocumentFields(raw({ entity: null })).warnings).toContain("entidade_ausente");
    expect(normalizeDocumentFields(raw({ entity: "   " })).warnings).toContain("entidade_ausente");
    expect(normalizeDocumentFields(raw({ entity: "1054" })).warnings).toContain(
      "entidade_invalida",
    );
    expect(normalizeDocumentFields(raw({ entity: "1054" })).entity).toBeNull();
  });

  it("limpa a pontuação da entidade antes de contar os dígitos", () => {
    expect(normalizeDocumentFields(raw({ entity: " 105 41 " })).entity).toBe(ENTITY);
  });

  describe("valor", () => {
    it("aceita os formatos que o portal usa", () => {
      expect(normalizeDocumentFields(raw({ amount: "1.234,56 €" })).amount).toBe("1234.56");
      expect(normalizeDocumentFields(raw({ amount: "1234,56" })).amount).toBe("1234.56");
      expect(normalizeDocumentFields(raw({ amount: "1234.56" })).amount).toBe("1234.56");
      expect(normalizeDocumentFields(raw({ amount: 1234.5 })).amount).toBe("1234.50");
      expect(normalizeDocumentFields(raw({ amount: "1.234" })).amount).toBe("1234.00");
    });

    it("zero, negativo ou texto são valor_invalido", () => {
      for (const amount of ["0", "0,00", "-50,00", "texto", "€"]) {
        const fields = normalizeDocumentFields(raw({ amount }));
        expect(fields.amount, `amount=${amount}`).toBeNull();
        expect(fields.warnings, `amount=${amount}`).toContain("valor_invalido");
      }
    });

    it("mais de 12 dígitos inteiros é valor_invalido", () => {
      expect(normalizeDocumentFields(raw({ amount: "1234567890123,00" })).warnings).toContain(
        "valor_invalido",
      );
      expect(normalizeDocumentFields(raw({ amount: "999999999999,00" })).amount).toBe(
        "999999999999.00",
      );
    });

    it("valor ausente é valor_ausente", () => {
      expect(normalizeDocumentFields(raw({ amount: undefined })).warnings).toContain(
        "valor_ausente",
      );
    });
  });

  it("é total: não lança com um objeto vazio e acumula as três ressalvas de ausência", () => {
    const fields = normalizeDocumentFields({} as RawDocumentFields);
    expect(fields).toEqual({
      entity: null,
      reference: null,
      amount: null,
      warnings: ["entidade_ausente", "referencia_ausente", "valor_ausente"],
    });
  });

  it("as ressalvas são códigos e nunca transportam o valor lido (RGPD)", () => {
    const fields = normalizeDocumentFields({
      entity: "999",
      reference: "12345678901234",
      amount: "-4321,99",
    });
    const serialized = JSON.stringify(fields.warnings);
    expect(serialized).not.toMatch(/\d/);
    expect(serialized).not.toContain("999");
    expect(serialized).not.toContain("12345678901234");
    expect(serialized).not.toContain("4321");
  });
});

describe("documentFieldsComplete", () => {
  it("só é completo com os três campos presentes", () => {
    expect(documentFieldsComplete(normalizeDocumentFields(raw()))).toBe(true);
    expect(documentFieldsComplete(normalizeDocumentFields(raw({ amount: null })))).toBe(false);
    expect(documentFieldsComplete(normalizeDocumentFields(raw({ entity: null })))).toBe(false);
    expect(documentFieldsComplete(normalizeDocumentFields(raw({ reference: null })))).toBe(false);
  });
});

describe("taxIdMatches", () => {
  it("compara só os dígitos", () => {
    expect(taxIdMatches("501 442 600", NIF)).toBe(true);
    expect(taxIdMatches("NIF: 501442600", NIF)).toBe(true);
    expect(taxIdMatches(501442600, NIF)).toBe(true);
  });

  it("devolve false quando o NIF do PDF é de outro contribuinte", () => {
    expect(taxIdMatches("502011378", NIF)).toBe(false);
  });

  it("devolve null quando o campo é ilegível", () => {
    expect(taxIdMatches(null, NIF)).toBeNull();
    expect(taxIdMatches("", NIF)).toBeNull();
    expect(taxIdMatches("ilegível", NIF)).toBeNull();
    expect(taxIdMatches({}, NIF)).toBeNull();
    expect(taxIdMatches(NIF, "")).toBeNull();
  });
});
