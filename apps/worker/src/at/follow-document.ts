import type { Page, Response } from "playwright";

/**
 * Guarda a última resposta do **documento principal** enquanto uma navegação
 * decorre, para o classificador poder ver o código HTTP.
 *
 * Um `Page` não sabe com que status foi servido, e nem toda a navegação passa
 * por um `goto` que devolva a `Response` — o submit de um formulário, por
 * exemplo, ou o login que a extensão do TOConline faz por nós. Sem isto, um
 * 503 com um corpo que a redação não reconhece era classificado como página
 * desconhecida, ou seja, estrutural: uma avaria de minutos na AT gastava a
 * fila inteira sem retentativa nenhuma.
 *
 * O estado vive num objeto e não numa variável solta de propósito: o
 * TypeScript não vê as atribuições feitas dentro do ouvinte e estreitaria uma
 * variável `let` para `null` no ponto de leitura.
 */
export function followDocument(page: Page): { readonly ultima: Response | null; parar(): void } {
  const registo: { ultima: Response | null } = { ultima: null };
  const ouvinte = (resposta: Response): void => {
    if (!resposta.request().isNavigationRequest()) return;
    if (resposta.frame() !== page.mainFrame()) return;
    registo.ultima = resposta;
  };
  page.on("response", ouvinte);
  return {
    get ultima(): Response | null {
      return registo.ultima;
    },
    parar: () => page.removeListener("response", ouvinte),
  };
}
