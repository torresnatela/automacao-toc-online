import { describe, it, expect } from "vitest";
import { validateTeamInput, type TeamInput } from "../src/domain/index";

function validInput(overrides: Partial<TeamInput> = {}): TeamInput {
  return { name: "Gabinete Silva & Costa", nif: "500000000", status: "active", ...overrides };
}

describe("validateTeamInput", () => {
  it("retorna null para uma equipe válida", () => {
    expect(validateTeamInput(validInput())).toBeNull();
  });

  it("exige nome não vazio", () => {
    expect(validateTeamInput(validInput({ name: "  " }))?.name).toBeTruthy();
  });

  it("aceita nif ausente mas valida estrutura + dígito de controlo quando informado", () => {
    expect(validateTeamInput(validInput({ nif: null }))).toBeNull();
    expect(validateTeamInput(validInput({ nif: "12" }))?.nif).toBeTruthy(); // curto
    expect(validateTeamInput(validInput({ nif: "501234567" }))?.nif).toBeTruthy(); // controlo errado
  });

  it("rejeita status fora do enum", () => {
    expect(
      validateTeamInput(validInput({ status: "bogus" as TeamInput["status"] }))?.status,
    ).toBeTruthy();
  });
});
