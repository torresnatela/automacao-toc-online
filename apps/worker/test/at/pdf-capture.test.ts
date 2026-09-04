import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright";
import { capturePdf } from "../../src/at/pdf-capture";
import { AtTransientError } from "../../src/errors";

/**
 * A corrida das três estratégias, provada **sem browser**.
 *
 * O que aqui se testa não é o Playwright: é a política da corrida — que as três
 * ficam à escuta ANTES do gatilho, que a primeira a trazer bytes vence, que as
 * perdedoras não ficam com ouvintes pendurados (num lote de 182 empresas isso é
 * uma fuga de memória por empresa) e que uma estratégia que rebenta não derruba
 * as outras.
 */

/** Emissor de eventos mínimo, com contagem de ouvintes — é isso que se afere. */
class Emissor {
  private readonly ouvintes = new Map<string, Set<(arg: unknown) => void>>();

  on(evento: string, ouvinte: (arg: unknown) => void): void {
    const conjunto = this.ouvintes.get(evento) ?? new Set<(arg: unknown) => void>();
    conjunto.add(ouvinte);
    this.ouvintes.set(evento, conjunto);
  }

  removeListener(evento: string, ouvinte: (arg: unknown) => void): void {
    this.ouvintes.get(evento)?.delete(ouvinte);
  }

  emitir(evento: string, arg: unknown): void {
    for (const ouvinte of [...(this.ouvintes.get(evento) ?? [])]) ouvinte(arg);
  }

  get pendentes(): number {
    let total = 0;
    for (const conjunto of this.ouvintes.values()) total += conjunto.size;
    return total;
  }
}

class ContextoFalso extends Emissor {
  pedidos: string[] = [];
  contentType = "application/pdf";
  corpo = Buffer.from("%PDF-1.4 popup");

  readonly request = {
    get: async (url: string) => {
      this.pedidos.push(url);
      return {
        headers: () => ({ "content-type": this.contentType }),
        body: async () => this.corpo,
      };
    },
  };
}

class PaginaFalsa extends Emissor {
  constructor(private readonly contexto: ContextoFalso) {
    super();
  }
  context(): ContextoFalso {
    return this.contexto;
  }
}

function montar(): { page: PaginaFalsa; context: ContextoFalso; alvo: Page } {
  const context = new ContextoFalso();
  const page = new PaginaFalsa(context);
  // O duplo casting é o preço de testar a política sem um Chromium: só se usam
  // as quatro peças do `Page` que a corrida toca.
  return { page, context, alvo: page as unknown as Page };
}

function resposta(contentType: string, corpo: Buffer, contentDisposition?: string): unknown {
  const headers: Record<string, string> = { "content-type": contentType };
  if (contentDisposition !== undefined) headers["content-disposition"] = contentDisposition;
  return { headers: () => headers, body: async () => corpo };
}

function popupFalso(url: string, aoFechar: () => void): unknown {
  return {
    waitForLoadState: async () => undefined,
    url: () => url,
    close: async () => aoFechar(),
  };
}

describe("capturePdf", () => {
  it("regista as estratégias ANTES do gatilho — um PDF instantâneo não se perde", async () => {
    const { page, alvo } = montar();
    const bytes = Buffer.from("%PDF-1.4 inline");

    const capturado = await capturePdf(
      alvo,
      async () => {
        // Emitido DENTRO do gatilho: se a escuta começasse depois, isto perdia-se.
        page.emitir("response", resposta("application/pdf", bytes));
      },
      { timeoutMs: 1_000 },
    );

    expect(capturado).toEqual({ pdf: bytes, via: "inline" });
  });

  it("a primeira a trazer bytes vence e as perdedoras ficam sem ouvintes", async () => {
    const { page, context, alvo } = montar();
    let popupFechado = false;

    const capturado = await capturePdf(
      alvo,
      async () => page.emitir("response", resposta("application/pdf", Buffer.from("%PDF- a"))),
      { timeoutMs: 1_000 },
    );

    expect(capturado.via).toBe("inline");
    expect(page.pendentes).toBe(0);
    expect(context.pendentes).toBe(0);

    // Eventos que cheguem atrasados já não encontram ninguém à escuta.
    page.emitir("download", { path: async () => "/nao/existe", delete: async () => undefined });
    context.emitir("page", popupFalso("http://exemplo/doc.pdf", () => (popupFechado = true)));
    expect(context.pedidos).toEqual([]);
    expect(popupFechado).toBe(false);
  });

  it("o download vence quando é ele o primeiro a chegar", async () => {
    const { page, alvo } = montar();
    const dir = await mkdtemp(join(tmpdir(), "toc-pdf-"));
    const caminho = join(dir, "guia.pdf");
    const bytes = Buffer.from("%PDF-1.4 descarregado");
    await writeFile(caminho, bytes);
    let apagado = false;

    const capturado = await capturePdf(
      alvo,
      async () =>
        page.emitir("download", {
          path: async () => caminho,
          delete: async () => {
            apagado = true;
          },
        }),
      { timeoutMs: 1_000 },
    );

    expect(capturado).toEqual({ pdf: bytes, via: "download" });
    // O ficheiro temporário do Playwright não se apaga sozinho: 182 empresas
    // por mês deixariam 182 guias em disco.
    expect(apagado).toBe(true);
  });

  it("o popup vence com o PDF pedido pelo contexto autenticado", async () => {
    const { context, alvo } = montar();
    let fechado = false;

    const capturado = await capturePdf(
      alvo,
      async () => context.emitir("page", popupFalso("http://exemplo/doc.pdf", () => (fechado = true))),
      { timeoutMs: 1_000 },
    );

    expect(capturado).toEqual({ pdf: context.corpo, via: "popup" });
    expect(context.pedidos).toEqual(["http://exemplo/doc.pdf"]);
    expect(fechado).toBe(true);
  });

  it("uma estratégia que rebenta não derruba a que traz o PDF", async () => {
    const { page, alvo } = montar();
    const bytes = Buffer.from("%PDF-1.4 bom");

    const capturado = await capturePdf(
      alvo,
      async () => {
        // O modo `attachment` emite os dois: ler o corpo da resposta
        // descarregada rebenta, e o download é que traz os bytes.
        page.emitir("download", {
          path: async () => {
            throw new Error("sem ficheiro");
          },
          delete: async () => undefined,
        });
        page.emitir("response", resposta("application/pdf", bytes));
      },
      { timeoutMs: 1_000 },
    );

    expect(capturado.via).toBe("inline");
  });

  it("respostas marcadas como anexo ficam para a estratégia do download", async () => {
    const { page, alvo } = montar();
    const bytes = Buffer.from("%PDF-1.4 anexo");

    const capturado = await capturePdf(
      alvo,
      async () => {
        page.emitir(
          "response",
          resposta("application/pdf", Buffer.from("corpo indisponível"), "attachment"),
        );
        page.emitir("download", { path: async () => null, delete: async () => undefined });
        page.emitir("response", resposta("application/pdf", bytes));
      },
      { timeoutMs: 1_000 },
    );

    // A resposta com `attachment` foi ignorada; venceu a segunda, inline.
    expect(capturado.pdf).toEqual(bytes);
  });

  it("as três falharem → AtTransientError, sem esperar pelo tempo todo", async () => {
    const { page, context, alvo } = montar();
    context.contentType = "text/html";

    const inicio = Date.now();
    const erro = await capturePdf(
      alvo,
      async () => {
        page.emitir("download", {
          path: async () => {
            throw new Error("sem ficheiro");
          },
          delete: async () => undefined,
        });
        page.emitir("response", {
          headers: () => ({ "content-type": "application/pdf" }),
          body: async () => {
            throw new Error("corpo indisponível");
          },
        });
        context.emitir("page", popupFalso("http://exemplo/doc.pdf", () => undefined));
      },
      { timeoutMs: 10_000 },
    )
      .then(() => null)
      .catch((e: unknown) => e as AtTransientError);

    expect(erro).toBeInstanceOf(AtTransientError);
    expect(erro?.outcome).toBe("document_capture_failed");
    expect(Date.now() - inicio).toBeLessThan(5_000);
    expect(page.pendentes).toBe(0);
    expect(context.pendentes).toBe(0);
  });

  it("nada chegar dentro do tempo → AtTransientError(document_capture_failed)", async () => {
    const { page, context, alvo } = montar();

    const erro = await capturePdf(alvo, async () => undefined, { timeoutMs: 60 })
      .then(() => null)
      .catch((e: unknown) => e as AtTransientError);

    expect(erro).toBeInstanceOf(AtTransientError);
    expect(erro?.outcome).toBe("document_capture_failed");
    expect(page.pendentes).toBe(0);
    expect(context.pendentes).toBe(0);
  });

  it("um gatilho que rebenta propaga o erro em vez de esperar pelo timeout", async () => {
    const { page, alvo } = montar();

    const erro = await capturePdf(
      alvo,
      async () => {
        throw new Error("botão não encontrado");
      },
      { timeoutMs: 10_000 },
    )
      .then(() => null)
      .catch((e: unknown) => e as Error);

    expect(erro?.message).toBe("botão não encontrado");
    expect(page.pendentes).toBe(0);
  });
});
