import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Um worker, em série, e não por lentidão: `documentos-iva`,
  // `documentos-download` e `integracoes-at` partilham a MESMA credencial `at`
  // da equipa demo e a MESMA fila de jobs (a base de dados de e2e é uma só, e
  // não há mutex entre ficheiros no Playwright). Em paralelo, o ficheiro que
  // apaga a credencial na sua montagem tira-a debaixo dos pés do que a acabou
  // de guardar. Fixado aqui, e não numa flag da linha de comandos, para que
  // `pnpm test` seja determinístico para quem não conhece esta armadilha.
  fullyParallel: false,
  workers: 1,
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: { baseURL: "http://localhost:3000" },
});
