import { describe, it, expect } from "vitest";
import { validateCompanyInput, type CompanyInput } from "../src/domain/index";

// Base válida reutilizada nos casos; cada teste sobrescreve o campo em foco.
function validInput(overrides: Partial<CompanyInput> = {}): CompanyInput {
  return {
    teamId: "11111111-1111-1111-1111-111111111111",
    niss: "12345678901",
    nif: "500000000",
    name: "Padaria Central Lda",
    type: "employer",
    status: "active",
    email: "geral@padaria.pt",
    phone: "+351 210 000 000",
    addressLine1: "Rua das Flores 10",
    postalCode: "1049-013",
    city: "Lisboa",
    country: "PT",
    ...overrides,
  };
}

describe("validateCompanyInput", () => {
  it("retorna null para um cadastro válido", () => {
    expect(validateCompanyInput(validInput())).toBeNull();
  });

  it("exige NISS com exatamente 11 dígitos, sem zero à esquerda", () => {
    expect(validateCompanyInput(validInput({ niss: "123" }))?.niss).toBeTruthy();
    expect(validateCompanyInput(validInput({ niss: "1234567890a" }))?.niss).toBeTruthy();
    expect(validateCompanyInput(validInput({ niss: "" }))?.niss).toBeTruthy();
    expect(validateCompanyInput(validInput({ niss: "123456789012" }))?.niss).toBeTruthy(); // 12 dígitos
    // Zero à esquerda seria corrompido ao virar bigint (0123... → 123...): rejeitado.
    expect(validateCompanyInput(validInput({ niss: "01234567890" }))?.niss).toBeTruthy();
    expect(validateCompanyInput(validInput({ niss: "00000000000" }))?.niss).toBeTruthy();
    expect(validateCompanyInput(validInput({ niss: 12345678901 }))).toBeNull();
  });

  it("exige nome não vazio", () => {
    expect(validateCompanyInput(validInput({ name: "   " }))?.name).toBeTruthy();
  });

  it("rejeita tipo de contribuinte fora do enum", () => {
    expect(
      validateCompanyInput(validInput({ type: "invalid" as CompanyInput["type"] }))?.type,
    ).toBeTruthy();
  });

  it("aceita nif ausente mas valida estrutura + dígito de controlo quando informado", () => {
    expect(validateCompanyInput(validInput({ nif: null }))).toBeNull();
    expect(validateCompanyInput(validInput({ nif: "" }))).toBeNull();
    expect(validateCompanyInput(validInput({ nif: "123" }))?.nif).toBeTruthy(); // curto
    expect(validateCompanyInput(validInput({ nif: "501234567" }))?.nif).toBeTruthy(); // controlo errado
    expect(validateCompanyInput(validInput({ nif: "500000000" }))).toBeNull(); // válido
  });

  it("valida o formato do código postal português (1234-567)", () => {
    expect(validateCompanyInput(validInput({ postalCode: "1049013" }))?.postalCode).toBeTruthy();
    expect(validateCompanyInput(validInput({ postalCode: null }))).toBeNull();
  });

  it("exige país com 2 letras ISO", () => {
    expect(validateCompanyInput(validInput({ country: "Portugal" }))?.country).toBeTruthy();
  });

  it("rejeita email malformado quando informado", () => {
    expect(validateCompanyInput(validInput({ email: "sem-arroba" }))?.email).toBeTruthy();
    expect(validateCompanyInput(validInput({ email: null }))).toBeNull();
  });

  it("exige teamId", () => {
    expect(validateCompanyInput(validInput({ teamId: "" }))?.teamId).toBeTruthy();
  });
});
