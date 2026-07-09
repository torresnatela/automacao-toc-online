import { describe, it, expect } from "vitest";
import { validateNewPassword } from "../src/auth/index";

describe("validateNewPassword", () => {
  it("aceita senha válida e igual à confirmação", () => {
    expect(validateNewPassword("segredo123", "segredo123")).toBeNull();
  });

  it("rejeita senha com menos de 6 caracteres", () => {
    expect(validateNewPassword("123", "123")).toBe("curta");
  });

  it("rejeita quando a confirmação não confere", () => {
    expect(validateNewPassword("segredo123", "outra123")).toBe("confere");
  });
});
