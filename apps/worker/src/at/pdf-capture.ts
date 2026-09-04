import { readFile } from "node:fs/promises";
import type { BrowserContext, Download, Page, Response } from "playwright";
import { AtTransientError } from "../errors";
import type { PdfVia } from "../runner/ports";

/**
 * Apanhar o PDF da guia, seja qual for a forma como o portal o entrega.
 *
 * O mesmo botão do Portal das Finanças produz três comportamentos diferentes
 * conforme o cabeçalho que o servidor mandar naquele dia: um **download**
 * (`Content-Disposition: attachment`), uma **navegação inline** para o visor de
 * PDF, ou uma **janela nova**. Ninguém do lado de cá sabe qual vai ser, e
 * escolher errado dá um timeout que não explica nada.
 *
 * Por isso as três ficam à escuta **antes** do clique e competem: quem trouxer
 * bytes primeiro ganha, as outras são desligadas. Registar depois do clique
 * seria perder o download que chega no mesmo instante.
 *
 * Duas regras que não são detalhe:
 *
 * - **`page.pdf()` é proibido.** Ele imprime o que a página está a mostrar — ou
 *   seja, o visor de PDF do Chromium — e não o documento que a AT emitiu. O
 *   ficheiro que sairia daí parece uma guia e não é: não tem a referência de
 *   pagamento legível nem serve para pagar.
 * - **Uma estratégia que falha não derruba a corrida.** No modo `attachment` o
 *   Chromium emite a resposta *e* o download, e ler o corpo de uma resposta
 *   descarregada rebenta. Se isso decidisse a corrida, a captura falhava com o
 *   PDF já em disco.
 */

export interface CapturedPdf {
  pdf: Buffer;
  via: PdfVia;
}

/** Uma tentativa em curso e a forma de a desligar sem deixar ouvintes. */
interface Estrategia {
  /** Resolve com o PDF; rejeitar significa "esta não deu", não "a corrida falhou". */
  readonly resultado: Promise<CapturedPdf>;
  cancelar(): Promise<void>;
}

export async function capturePdf(
  page: Page,
  trigger: () => Promise<void>,
  opts: { timeoutMs: number },
): Promise<CapturedPdf> {
  const context = page.context();
  const estrategias = [porDownload(page), porResposta(page), porPopup(context, opts.timeoutMs)];
  let temporizador: ReturnType<typeof setTimeout> | null = null;

  try {
    return await new Promise<CapturedPdf>((resolve, reject) => {
      let decidido = false;
      let falhadas = 0;
      const ganhar = (capturado: CapturedPdf): void => {
        if (decidido) return;
        decidido = true;
        resolve(capturado);
      };
      const desistir = (erro: Error): void => {
        if (decidido) return;
        decidido = true;
        reject(erro);
      };

      for (const estrategia of estrategias) {
        estrategia.resultado.then(ganhar, () => {
          falhadas += 1;
          // Só quando não sobra nenhuma é que a corrida acabou — e aí não se
          // espera pelo tempo todo por um desfecho que já se conhece.
          if (falhadas === estrategias.length) {
            desistir(
              new AtTransientError(
                "document_capture_failed",
                "Nenhuma das formas de obter o documento devolveu o PDF.",
              ),
            );
          }
        });
      }

      temporizador = setTimeout(() => {
        desistir(
          new AtTransientError(
            "document_capture_failed",
            "O portal não devolveu o PDF dentro do tempo previsto.",
          ),
        );
      }, opts.timeoutMs);

      // O gatilho é o ÚLTIMO passo, e o seu erro decide a corrida: um botão que
      // não existe é para saber já, não daqui a 45 segundos.
      void trigger().catch((err: unknown) => {
        desistir(err instanceof Error ? err : new Error(String(err)));
      });
    });
  } finally {
    if (temporizador !== null) clearTimeout(temporizador);
    for (const estrategia of estrategias) {
      await estrategia.cancelar().catch(() => undefined);
    }
  }
}

/** (a) O portal manda `Content-Disposition: attachment` e o Chromium descarrega. */
function porDownload(page: Page): Estrategia {
  let ouvinte: ((download: Download) => void) | null = null;
  const resultado = new Promise<Download>((resolve) => {
    ouvinte = resolve;
    page.on("download", resolve);
  }).then(async (download): Promise<CapturedPdf> => {
    const caminho = await download.path();
    if (!caminho) throw new Error("o download não deixou ficheiro em disco");
    const pdf = await readFile(caminho);
    // O temporário do Playwright vive enquanto o contexto viver: num lote de
    // 182 empresas por mês, não o apagar é encher o disco do worker.
    await download.delete().catch(() => undefined);
    return { pdf, via: "download" };
  });
  return {
    resultado,
    cancelar: async () => {
      if (ouvinte !== null) page.removeListener("download", ouvinte);
    },
  };
}

/** (b) O portal serve o PDF na própria página, e o corpo da resposta chega-nos. */
function porResposta(page: Page): Estrategia {
  let ouvinte: ((response: Response) => void) | null = null;
  const resultado = new Promise<Response>((resolve) => {
    const escuta = (response: Response): void => {
      const headers = response.headers();
      if (!(headers["content-type"] ?? "").includes("application/pdf")) return;
      // Uma resposta marcada como anexo é matéria da estratégia (a): o corpo
      // dela já não está disponível para leitura e pedi-lo só dá erro.
      if ((headers["content-disposition"] ?? "").includes("attachment")) return;
      resolve(response);
    };
    ouvinte = escuta;
    page.on("response", escuta);
  }).then(async (response): Promise<CapturedPdf> => ({
    pdf: await response.body(),
    via: "inline",
  }));
  return {
    resultado,
    cancelar: async () => {
      if (ouvinte !== null) page.removeListener("response", ouvinte);
    },
  };
}

/** (c) O botão abre uma janela nova com o PDF lá dentro. */
function porPopup(context: BrowserContext, timeoutMs: number): Estrategia {
  let ouvinte: ((popup: Page) => void) | null = null;
  let aberta: Page | null = null;
  const resultado = new Promise<Page>((resolve) => {
    const escuta = (popup: Page): void => {
      aberta = popup;
      resolve(popup);
    };
    ouvinte = escuta;
    context.on("page", escuta);
  }).then(async (popup): Promise<CapturedPdf> => {
    // Sem esperar, `url()` ainda é `about:blank`. Se o visor nunca acabar de
    // carregar seguimos na mesma: o que interessa é a URL, não o render.
    await popup.waitForLoadState("domcontentloaded", { timeout: timeoutMs }).catch(() => undefined);
    // `context.request` leva os cookies da sessão — o PDF vem pelo mesmo
    // caminho autenticado por onde o popup lá chegou.
    const resposta = await context.request.get(popup.url());
    if (!(resposta.headers()["content-type"] ?? "").includes("application/pdf")) {
      throw new Error("a janela aberta pelo portal não devolveu um PDF");
    }
    const pdf = await resposta.body();
    await popup.close().catch(() => undefined);
    aberta = null;
    return { pdf, via: "popup" };
  });
  return {
    resultado,
    cancelar: async () => {
      if (ouvinte !== null) context.removeListener("page", ouvinte);
      // Um popup que perdeu a corrida fica órfão no contexto até ele fechar.
      if (aberta !== null) await aberta.close().catch(() => undefined);
    },
  };
}
