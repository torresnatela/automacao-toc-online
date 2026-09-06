import { describe, expect, it, vi } from "vitest";
import { createDb } from "../src/client";

/**
 * A pool do `pg` emite `error` quando um cliente INATIVO perde a ligação (o
 * Postgres reiniciou, o Docker caiu, a rede piscou). Sem ouvinte, o Node trata
 * um `error` sem dono como fatal e derruba o processo — foi assim que o worker
 * morreu a meio de um job da rota A quando a BD local caiu. Um worker de fila
 * não pode morrer por uma ligação inativa: o job em curso falha na próxima
 * query (retentável) e a fila continua.
 */
describe("createDb", () => {
  it("um erro de cliente inativo na pool não derruba o processo", () => {
    const db = createDb("postgresql://ninguem:nada@127.0.0.1:1/inexistente");
    const stderr = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(() => db.$client.emit("error", new Error("Connection terminated unexpectedly"))).not.toThrow();
      // Fica registado (sem a connection string, que leva a senha).
      expect(stderr).toHaveBeenCalledTimes(1);
      const linha = String(stderr.mock.calls[0]?.[0]);
      expect(linha).toContain("Connection terminated unexpectedly");
      expect(linha).not.toContain("ninguem:nada");
    } finally {
      stderr.mockRestore();
      void db.$client.end();
    }
  });
});
