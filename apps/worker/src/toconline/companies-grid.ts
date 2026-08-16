import type { Page } from "playwright";
import { StructuralError } from "../errors";
import { projectGrid, type GridProjection } from "./project-grid";

/**
 * Lê a lista completa de empresas do `vaadin-grid` do TOConline.
 *
 * Duas restrições moldam esta função, ambas observadas no portal real:
 *
 * 1. **Shadow DOM.** A grelha vive três camadas fundo (`toc-app` →
 *    `casper-simple-page` → `vaadin-grid`), todas em shadow root aberto. Usa-se
 *    o locator do Playwright, cujo motor CSS atravessa — escrever um walker de
 *    shadow roots à mão seria duplicar esse motor e partir-se-ia com qualquer
 *    camada nova. (XPath **não** atravessa: proibido neste diretório.)
 *
 * 2. **Virtualização + WebSocket.** Só ~60 das 182 linhas existem no DOM, e os
 *    dados chegam em tranches por um socket proprietário. `waitUntil:
 *    "networkidle"` é inútil aqui. A espera correta é sobre o *estado* de
 *    `items`, com uma janela de estabilidade: lê-se o total, espera-se, lê-se
 *    de novo, e só se aceita quando repete. Sem isso, lê-se 60 de 182 e
 *    persiste-se uma verdade truncada — que parece sucesso.
 */

export interface GridReadOptions {
  /** Tempo total à espera que o grid encha. */
  timeoutMs?: number;
  /** Janela de estabilidade: o total tem de repetir-se entre duas leituras. */
  quietMs?: number;
}

export interface GridRead extends GridProjection {
  gridCount: number;
  durationMs: number;
}

const DEFAULT_TIMEOUT = 45_000;
const DEFAULT_QUIET = 750;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Conta os itens de um grid sem os projetar — barato o bastante para repetir. */
function countItems(el: unknown): number {
  const grid = (el || {}) as Record<string, unknown>;
  if (Array.isArray(grid.items)) return grid.items.length;
  const data = grid.__data as Record<string, unknown> | undefined;
  if (data && Array.isArray(data.items)) return data.items.length;
  if (Array.isArray(grid._items)) return grid._items.length;
  return -1;
}

export async function readCompaniesGrid(
  page: Page,
  options: GridReadOptions = {},
): Promise<GridRead> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT;
  const quietMs = options.quietMs ?? DEFAULT_QUIET;
  const started = Date.now();

  const grids = page.locator("vaadin-grid");
  try {
    await grids.first().waitFor({ state: "attached", timeout: timeoutMs });
  } catch {
    throw new StructuralError(
      "Nenhum `vaadin-grid` na página de empresas do TOConline. A estrutura do portal mudou.",
    );
  }

  const gridCount = await grids.count();

  // Pode haver mais de uma grelha na página; a que interessa é a que tem dados.
  let handle = null;
  const deadline = started + timeoutMs;
  while (Date.now() < deadline) {
    for (let i = 0; i < gridCount; i++) {
      const candidate = await grids.nth(i).elementHandle();
      if (!candidate) continue;
      if ((await candidate.evaluate(countItems)) > 0) {
        handle = candidate;
        break;
      }
      await candidate.dispose();
    }
    if (handle) break;
    await sleep(250);
  }

  if (!handle) {
    throw new StructuralError(
      `Nenhum \`vaadin-grid\` da página trouxe empresas em ${timeoutMs}ms. A sessão pode ter expirado ou o portal mudou.`,
    );
  }

  try {
    // Janela de estabilidade. É esta a defesa real contra ler no meio do
    // stream — nem o `size` anunciado a substitui, porque ele acompanha os
    // dados enquanto chegam.
    let previous = await handle.evaluate(countItems);
    while (Date.now() < deadline) {
      await sleep(quietMs);
      const current = await handle.evaluate(countItems);
      if (current === previous && current > 0) break;
      previous = current;
    }

    const projection = (await handle.evaluate(projectGrid)) as GridProjection;
    return { ...projection, gridCount, durationMs: Date.now() - started };
  } finally {
    await handle.dispose();
  }
}
