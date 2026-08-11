import { describe, it, expect } from "vitest";
import { loadEnv, MissingEnvError } from "../../src/config/env";

const complete = {
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54422/postgres",
  SUPABASE_URL: "http://127.0.0.1:54421",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  TOCONLINE_USER: "gabinete@example.pt",
  TOCONLINE_PASSWORD: "segredo-super-secreto",
};

describe("loadEnv", () => {
  it("lê todas as variáveis obrigatórias", () => {
    const env = loadEnv(complete);
    expect(env.databaseUrl).toBe(complete.DATABASE_URL);
    expect(env.toconlineUser).toBe("gabinete@example.pt");
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
    const { TOCONLINE_USER: _u, DATABASE_URL: _d, ...partial } = complete;
    expect(() => loadEnv(partial)).toThrow(MissingEnvError);
    try {
      loadEnv(partial);
    } catch (err) {
      expect((err as MissingEnvError).variables).toEqual(
        expect.arrayContaining(["DATABASE_URL", "TOCONLINE_USER"]),
      );
    }
  });

  it("nunca inclui o valor da senha na mensagem de erro", () => {
    const { DATABASE_URL: _d, ...partial } = complete;
    try {
      loadEnv(partial);
    } catch (err) {
      expect((err as Error).message).not.toContain("segredo-super-secreto");
    }
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
});
