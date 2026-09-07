import { describe, expect, it } from "vitest";
import {
  DIRECT_ACCESS_WORDING,
  classifyDirectAccessSignals,
  classifyDirectAccessText,
} from "../../src/at/direct-access-wording";

/**
 * As redações do TOConline que decidem o desfecho ANTES de tocar na AT: a
 * página do Sumário diz se a extensão está instalada e se a senha da empresa
 * está gravada. Como em `classify-page.test.ts`, o que interessa provar são as
 * armadilhas — palavras que aparecem na página sem que nada tenha corrido mal.
 */

describe("classifyDirectAccessText", () => {
  it("o convite a instalar a extensão é extension_missing", () => {
    expect(
      classifyDirectAccessText("Acesso Direto — Para utilizar esta funcionalidade, instale a extensão. Instalar Extensão Chrome"),
    ).toBe("extension_missing");
  });

  it("a senha da empresa por gravar é password_not_configured", () => {
    expect(
      classifyDirectAccessText(
        "Acesso Direto Portal das Finanças — A senha da empresa não está configurada. Registe-a em Dados da empresa.",
      ),
    ).toBe("password_not_configured");
    expect(classifyDirectAccessText("Não existe senha gravada para este portal.")).toBe(
      "password_not_configured",
    );
  });

  it("o menu à vista, sem avisos, é ready", () => {
    expect(
      classifyDirectAccessText("Sumário  Acesso Direto  Portal das Finanças  Segurança Social  e-fatura"),
    ).toBe("ready");
  });

  it("armadilhas: «Senhas da empresa» é um menu, não um aviso; «Extensões» idem", () => {
    expect(
      classifyDirectAccessText("Configurações  Senhas da empresa  Acesso Direto  Portal das Finanças  Extensões"),
    ).toBe("ready");
  });

  it("sem menu nem avisos é unknown — nunca ready por omissão", () => {
    expect(classifyDirectAccessText("")).toBe("unknown");
    expect(classifyDirectAccessText("A carregar…")).toBe("unknown");
  });

  it("a extensão em falta ganha à senha em falta: sem extensão nada funciona", () => {
    expect(
      classifyDirectAccessText("Instalar Extensão Chrome. A senha da empresa não está configurada."),
    ).toBe("extension_missing");
  });
});

describe("classifyDirectAccessSignals", () => {
  it("segue a mesma precedência a partir de sinais já observados", () => {
    expect(
      classifyDirectAccessSignals({ extensionMissing: true, passwordNotConfigured: true, menuVisible: true }),
    ).toBe("extension_missing");
    expect(
      classifyDirectAccessSignals({ extensionMissing: false, passwordNotConfigured: true, menuVisible: true }),
    ).toBe("password_not_configured");
    expect(
      classifyDirectAccessSignals({ extensionMissing: false, passwordNotConfigured: false, menuVisible: true }),
    ).toBe("ready");
    expect(
      classifyDirectAccessSignals({ extensionMissing: false, passwordNotConfigured: false, menuVisible: false }),
    ).toBe("unknown");
  });
});

describe("DIRECT_ACCESS_WORDING", () => {
  it("as regexes são as que a página do TOConline tem de casar (para o probe por getByText)", () => {
    expect(DIRECT_ACCESS_WORDING.extensionMissing.test("Instalar Extensão Chrome")).toBe(true);
    expect(DIRECT_ACCESS_WORDING.extensionMissing.test("Extensões")).toBe(false);
    expect(DIRECT_ACCESS_WORDING.passwordNotConfigured.test("senha da empresa não está configurada")).toBe(true);
    expect(DIRECT_ACCESS_WORDING.passwordNotConfigured.test("Senhas da empresa")).toBe(false);
    expect(DIRECT_ACCESS_WORDING.directAccessMenu.test("Acesso Direto")).toBe(true);
    expect(DIRECT_ACCESS_WORDING.directAccessMenu.test("Acesso directo")).toBe(true);
  });
});
