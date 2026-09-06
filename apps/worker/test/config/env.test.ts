import { describe, it, expect } from "vitest";
import { loadEnv, MissingEnvError } from "../../src/config/env";

// As credenciais do TOConline NÃO estão aqui: vivem cifradas em
// `integration_credentials` e são resolvidas por job. O que o worker precisa do
// ambiente é a chave-mestra de cifra — sem ela não consegue decifrar nada.
const complete = {
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54422/postgres",
  SUPABASE_URL: "http://127.0.0.1:54421",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  CREDENTIALS_ENC_KEY: "aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789abcdefg=",
};

describe("loadEnv", () => {
  it("lê todas as variáveis obrigatórias", () => {
    const env = loadEnv(complete);
    expect(env.databaseUrl).toBe(complete.DATABASE_URL);
    expect(env.supabaseUrl).toBe(complete.SUPABASE_URL);
    expect(env.credentialsEncKey).toBe(complete.CREDENTIALS_ENC_KEY);
  });

  it("assume headless=true e concorrência=1 por omissão", () => {
    const env = loadEnv(complete);
    expect(env.headless).toBe(true);
    expect(env.rpaConcurrency).toBe(1);
  });

  it("permite desligar o headless para reconhecimento", () => {
    const env = loadEnv({ ...complete, RPA_HEADLESS: "false" });
    expect(env.headless).toBe(false);
  });

  it("lança MissingEnvError nomeando as variáveis em falta", () => {
    const { CREDENTIALS_ENC_KEY: _k, DATABASE_URL: _d, ...partial } = complete;
    expect(() => loadEnv(partial)).toThrow(MissingEnvError);
    try {
      loadEnv(partial);
    } catch (err) {
      expect((err as MissingEnvError).variables).toEqual(
        expect.arrayContaining(["DATABASE_URL", "CREDENTIALS_ENC_KEY"]),
      );
    }
  });

  it("nunca inclui o valor da chave de cifra na mensagem de erro", () => {
    const { DATABASE_URL: _d, ...partial } = complete;
    try {
      loadEnv(partial);
    } catch (err) {
      expect((err as Error).message).not.toContain(complete.CREDENTIALS_ENC_KEY);
    }
  });

  // As credenciais do TOConline deixaram de ser configuração: o utilizador
  // grava-as no dashboard e o worker recebe um `credentialId` no payload do job.
  describe("credenciais do TOConline", () => {
    it("não são obrigatórias — o worker resolve-as por job", () => {
      expect(() => loadEnv(complete)).not.toThrow();
      const env = loadEnv(complete);
      expect(env.toconlineUser).toBeUndefined();
      expect(env.toconlinePassword).toBeUndefined();
    });

    it("são lidas quando presentes, para o smoke test live", () => {
      const env = loadEnv({
        ...complete,
        TOCONLINE_USER: "gabinete@example.pt",
        TOCONLINE_PASSWORD: "segredo-super-secreto",
      });
      expect(env.toconlineUser).toBe("gabinete@example.pt");
      expect(env.toconlinePassword).toBe("segredo-super-secreto");
    });

    it("nunca inclui a senha na mensagem de erro", () => {
      const { DATABASE_URL: _d, ...partial } = complete;
      try {
        loadEnv({ ...partial, TOCONLINE_PASSWORD: "segredo-super-secreto" });
      } catch (err) {
        expect((err as Error).message).not.toContain("segredo-super-secreto");
      }
    });
  });

  describe("RPA_STATE_DIR", () => {
    // O storageState do Playwright é equivalente a credencial (cookies de sessão).
    // Vive fora do repo, num diretório git-ignored.
    it("assume .rpa por omissão", () => {
      expect(loadEnv(complete).stateDir).toBe(".rpa");
    });

    it("aceita um diretório indicado", () => {
      expect(loadEnv({ ...complete, RPA_STATE_DIR: "/tmp/rpa" }).stateDir).toBe("/tmp/rpa");
    });
  });

  describe("RPA_CONCURRENCY", () => {
    it("usa o valor indicado quando é um inteiro positivo válido", () => {
      const env = loadEnv({ ...complete, RPA_CONCURRENCY: "3" });
      expect(env.rpaConcurrency).toBe(3);
    });

    it("assume 1 quando a variável está vazia", () => {
      const env = loadEnv({ ...complete, RPA_CONCURRENCY: "" });
      expect(env.rpaConcurrency).toBe(1);
    });

    it("assume 1 quando a variável não é numérica", () => {
      const env = loadEnv({ ...complete, RPA_CONCURRENCY: "abc" });
      expect(env.rpaConcurrency).toBe(1);
    });

    it("assume 1 quando a variável está omitida", () => {
      const env = loadEnv(complete);
      expect(env.rpaConcurrency).toBe(1);
    });
  });

  // --- Módulo 1 — guia de pagamento do IVA (AT) ----------------------------
  // Todas com valor por omissão: um worker que só faz varredura não pode
  // deixar de arrancar por causa da configuração de um módulo que não usa.

  describe("DOCUMENTS_BUCKET", () => {
    it("assume documents por omissão", () => {
      expect(loadEnv(complete).documentsBucket).toBe("documents");
    });

    it("aceita um bucket indicado", () => {
      expect(loadEnv({ ...complete, DOCUMENTS_BUCKET: "guias" }).documentsBucket).toBe("guias");
    });

    it("assume documents quando a variável está vazia", () => {
      expect(loadEnv({ ...complete, DOCUMENTS_BUCKET: "" }).documentsBucket).toBe("documents");
    });
  });

  describe("AT_PACING_MS", () => {
    it("assume 5000 por omissão", () => {
      expect(loadEnv(complete).atPacingMs).toBe(5_000);
    });

    it("usa o valor indicado quando é um inteiro positivo", () => {
      expect(loadEnv({ ...complete, AT_PACING_MS: "12000" }).atPacingMs).toBe(12_000);
    });

    it("cai no valor por omissão quando não é numérico", () => {
      expect(loadEnv({ ...complete, AT_PACING_MS: "devagar" }).atPacingMs).toBe(5_000);
    });

    it("cai no valor por omissão quando é zero ou negativo", () => {
      expect(loadEnv({ ...complete, AT_PACING_MS: "0" }).atPacingMs).toBe(5_000);
      expect(loadEnv({ ...complete, AT_PACING_MS: "-1" }).atPacingMs).toBe(5_000);
    });
  });

  describe("AT_DAILY_ATTEMPT_CAP", () => {
    it("assume 5 por omissão", () => {
      expect(loadEnv(complete).atDailyAttemptCap).toBe(5);
    });

    it("usa o valor indicado quando é um inteiro positivo", () => {
      expect(loadEnv({ ...complete, AT_DAILY_ATTEMPT_CAP: "3" }).atDailyAttemptCap).toBe(3);
    });

    it("cai no valor por omissão quando é inválido", () => {
      expect(loadEnv({ ...complete, AT_DAILY_ATTEMPT_CAP: "muitas" }).atDailyAttemptCap).toBe(5);
    });
  });

  describe("AT_PORTAL_PAUSE_MS", () => {
    it("assume 15 minutos por omissão", () => {
      expect(loadEnv(complete).atPortalPauseMs).toBe(900_000);
    });

    it("usa o valor indicado quando é um inteiro positivo", () => {
      expect(loadEnv({ ...complete, AT_PORTAL_PAUSE_MS: "60000" }).atPortalPauseMs).toBe(60_000);
    });

    it("cai no valor por omissão quando não é inteiro", () => {
      expect(loadEnv({ ...complete, AT_PORTAL_PAUSE_MS: "1.5" }).atPortalPauseMs).toBe(900_000);
    });
  });

  describe("RPA_CHROME_*", () => {
    // Rota A (Acesso Direto do TOConline): um perfil persistente do Chromium do
    // Playwright com a extensão TOConline Connect descompactada. Têm sempre
    // valor: a rota A está sempre registada no worker, e o que decide se ela
    // funciona é a extensão estar (ou não) no diretório — não uma variável.
    it("assumem o perfil e a extensão dentro de .rpa por omissão", () => {
      const env = loadEnv(complete);
      expect(env.chromeUserDataDir).toBe(".rpa/chromium-profile");
      expect(env.chromeExtensionDir).toBe(".rpa/extensions/toconline-connect");
    });

    it("são lidos quando presentes", () => {
      const env = loadEnv({
        ...complete,
        RPA_CHROME_USER_DATA_DIR: "/tmp/chrome-profile",
        RPA_CHROME_EXTENSION_DIR: "/tmp/toconline-extension",
      });
      expect(env.chromeUserDataDir).toBe("/tmp/chrome-profile");
      expect(env.chromeExtensionDir).toBe("/tmp/toconline-extension");
    });

    it("uma variável vazia vale como ausente", () => {
      const env = loadEnv({ ...complete, RPA_CHROME_EXTENSION_DIR: "" });
      expect(env.chromeExtensionDir).toBe(".rpa/extensions/toconline-connect");
    });
  });
});
