import { describe, expect, it } from "vitest";
import { AtIntegrityError } from "../../src/errors";
import { assertSessionBelongsTo } from "../../src/at/guards";

/**
 * A guarda `at_session_mismatch`, partilhada pelas duas rotas: o portal
 * reaproveita a sessão do último contribuinte e uma troca silenciosa é como se
 * descarrega a guia da empresa errada. Só acusa quando os dois lados AFIRMAM
 * NIFs diferentes.
 */
describe("assertSessionBelongsTo", () => {
  it("passa quando a página afirma o NIF da empresa", () => {
    expect(() => assertSessionBelongsTo("Contribuinte NIF: 501442600 — Sumário", "501442600")).not.toThrow();
  });

  it("lança at_session_mismatch quando a página afirma OUTRO NIF", () => {
    expect(() => assertSessionBelongsTo("NIF: 111111111", "501442600")).toThrow(AtIntegrityError);
    try {
      assertSessionBelongsTo("NIF: 111111111", "501442600");
    } catch (err) {
      expect((err as AtIntegrityError).outcome).toBe("at_session_mismatch");
      // Nem a mensagem nem o fingerprint levam NIFs: isto acaba num last_error.
      expect((err as Error).message).not.toContain("111111111");
      expect((err as Error).message).not.toContain("501442600");
    }
  });

  it("um NIF ausente ou ilegível na página não prova nada", () => {
    expect(() => assertSessionBelongsTo("Bem-vindo ao Portal das Finanças", "501442600")).not.toThrow();
    expect(() => assertSessionBelongsTo("NIF: 12", "501442600")).not.toThrow();
  });

  it("sem NIF da empresa não há com que comparar", () => {
    expect(() => assertSessionBelongsTo("NIF: 111111111", null)).not.toThrow();
  });
});
