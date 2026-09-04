import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Testes unitários do web — a lógica pura que vive em `src/lib` (apresentação,
 * estados, prontidão). O Playwright continua a ser o dono de `e2e/`
 * (`testDir: "./e2e"`), por isso os dois conjuntos nunca se cruzam.
 *
 * `environment: "node"` de propósito: nada aqui toca no DOM, e o React só entra
 * nestes ficheiros por `import type` (apagado na compilação).
 *
 * Extensão `.mts` e não `.ts`: `apps/web` não é `"type": "module"` (o Next tem
 * os seus próprios ficheiros de configuração), e sem isto o Vite carregaria
 * esta configuração pela sua API CJS, já depreciada — um aviso em cada corrida.
 */
export default defineConfig({
  // O mesmo `@/` do tsconfig — sem isto os testes não conseguiriam importar
  // `@/lib/...` como o resto da aplicação.
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
