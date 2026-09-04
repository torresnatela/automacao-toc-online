import { describe, it, expect } from "vitest";
import { AT, assertAtHost } from "../../src/at/selectors";
import { AtIntegrityError, StructuralError } from "../../src/errors";

describe("assertAtHost", () => {
  it("aceita os hosts do Portal das Finanças e devolve o host", () => {
    expect(
      assertAtHost("https://iva.portaldasfinancas.gov.pt/dpiva/portal/cc/consultar-declaracao"),
    ).toBe("iva.portaldasfinancas.gov.pt");
    expect(assertAtHost("https://www.portaldasfinancas.gov.pt/de/qualquer/coisa")).toBe(
      "www.portaldasfinancas.gov.pt",
    );
  });

  it("recusa um host de fora", () => {
    expect(() => assertAtHost("https://evil.com/dpiva")).toThrow(AtIntegrityError);
  });

  it("recusa um sufixo que só finge ser da AT", () => {
    // O `$` do padrão é o que impede o clássico `…gov.pt.evil.com`.
    expect(() => assertAtHost("https://iva.portaldasfinancas.gov.pt.evil.com/dpiva")).toThrow(
      AtIntegrityError,
    );
  });

  it("classifica a recusa como estrutural, com o host no fingerprint", () => {
    try {
      assertAtHost("https://evil.com/dpiva");
      expect.unreachable("devia ter lançado");
    } catch (err) {
      expect(err).toBeInstanceOf(StructuralError);
      const integrity = err as AtIntegrityError;
      expect(integrity.outcome).toBe("at_unexpected_page");
      expect(integrity.message).toMatch(/host inesperado/i);
      expect(integrity.fingerprint).toEqual({ host: "evil.com" });
    }
  });

  it("trata uma URL inválida como falha estrutural", () => {
    expect(() => assertAtHost("nem sequer é uma url")).toThrow(StructuralError);
  });

  it("aceita um padrão injetado, para o teste apontar a um servidor local", () => {
    expect(assertAtHost("http://127.0.0.1:1234/dpiva", /^127\.0\.0\.1:\d+$/)).toBe(
      "127.0.0.1:1234",
    );
  });

  it("o padrão do portal é o predefinido de assertAtHost", () => {
    expect(AT.portalHostPattern.test("sitfiscal.portaldasfinancas.gov.pt")).toBe(true);
    expect(AT.loginHostPattern.test("www.acesso.gov.pt")).toBe(true);
    expect(AT.loginHostPattern.test("acesso.gov.pt")).toBe(false);
  });
});
