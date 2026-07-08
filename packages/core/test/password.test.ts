import { describe, it, expect } from "vitest";
import { generateTempPassword } from "../src/auth/index";

const AMBIGUOUS = ["0", "O", "1", "l", "I"];

describe("generateTempPassword", () => {
  it("gera senha com o comprimento pedido", () => {
    expect(generateTempPassword(20)).toHaveLength(20);
  });

  it("usa o comprimento padrão de 14 quando não informado", () => {
    expect(generateTempPassword()).toHaveLength(14);
  });

  it("usa apenas caracteres do charset permitido (sem ambíguos)", () => {
    const senha = generateTempPassword(200);
    for (const ambiguo of AMBIGUOUS) {
      expect(senha).not.toContain(ambiguo);
    }
    expect(senha).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/);
  });

  it("lança erro se o comprimento for menor que 6", () => {
    expect(() => generateTempPassword(5)).toThrow();
  });

  it("é determinística quando o gerador aleatório é injetado", () => {
    let n = 0;
    const randomInt = () => n++ % 3; // sequência previsível: 0,1,2,0,1,2 → chars A,B,C,A,B,C
    expect(generateTempPassword(6, randomInt)).toBe("ABCABC");
  });
});
