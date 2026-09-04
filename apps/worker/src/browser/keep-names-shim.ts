import type { BrowserContext } from "playwright";

/**
 * Repõe o helper `__name` dentro do browser.
 *
 * O `tsx` (esbuild) compila com `keepNames`, que embrulha cada função nomeada
 * em `__name(fn, "nome")` para o `fn.name` sobreviver à minificação. O
 * Playwright, por seu lado, envia para o browser o **código-fonte** da função
 * passada a `page.evaluate` — e leva o `__name` com ela, que do lado de lá não
 * existe. Resultado: todo o `page.evaluate(fn)` rebenta com
 * `ReferenceError: __name is not defined`.
 *
 * Só acontece sob `tsx` — ou seja, no `pnpm --filter @toc/worker dev` e nos
 * scripts de reconhecimento. O build com `tsc` e o Vitest não injetam o helper,
 * e é por isso que nenhum teste apanha isto: a falha vive exatamente no
 * caminho em que o worker é desenvolvido e o portal é observado.
 *
 * O shim vai como **string** de propósito: uma função aqui seria ela própria
 * embrulhada em `__name` e falharia a tentar instalar o remédio.
 */
const SHIM = "globalThis.__name = globalThis.__name || function (alvo) { return alvo; };";

export async function installKeepNamesShim(context: BrowserContext): Promise<void> {
  await context.addInitScript({ content: SHIM });
}
