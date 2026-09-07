import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Uma Segurança Social Direta de mentira, servida em `127.0.0.1`, com o
 * percurso que o gabinete pediu: Pagamentos e Dívidas → Valores a pagar →
 * Pagamentos → Fazer pagamento → «pedir para atuar em nome próprio» → valor →
 * Pagar → Multibanco → documento (PDF como anexo).
 *
 * O que se modela é o **contrato de texto** que o fetcher usa (rótulos dos
 * menus, redação do «nada a pagar», entidade/referência/valor), não o HTML
 * real da SSD — esse só a Fase 0 o dirá.
 */
export interface SsFixtureState {
  /** `null` = a empresa está em dia: a SSD diz que não há valores a pagar. */
  amountDue: string | null;
  /** Se `false`, o menu «Pagamentos e Dívidas» desaparece (fluxo mudou). */
  menuPresent: boolean;
  /** Se `false`, a opção de representação não existe (conta já em nome próprio). */
  representationOption: boolean;
}

export interface SsFixtureServer {
  baseUrl: string;
  state: SsFixtureState;
  /** Caminhos pedidos, para provar por onde o fetcher passou. */
  requests: string[];
  close(): Promise<void>;
}

export const SS_FIXTURE = {
  entidade: "11111",
  referencia: "123456789",
  valor: "1 234,56",
  nif: "509876543",
} as const;

/** Um PDF mínimo mas válido — e maior do que o limiar de «truncado». */
export const PDF_DE_TESTE: Buffer = (() => {
  const corpo = [
    "%PDF-1.4",
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >> endobj",
    `% ${"x".repeat(4096)}`,
    "xref",
    "0 4",
    "trailer << /Size 4 /Root 1 0 R >>",
    "startxref",
    "0",
    "%%EOF",
  ].join("\n");
  return Buffer.from(corpo, "latin1");
})();

function pagina(titulo: string, corpo: string): string {
  return `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>${titulo}</title></head>
<body><header><nav>
  <a href="/ptss/home">Início</a>
  __MENU__
  <a href="/ptss/conta">A minha conta</a>
</nav></header>
<main>${corpo}</main>
<footer>Segurança Social Direta — NIF: ${SS_FIXTURE.nif}</footer></body></html>`;
}

export async function startSsFixtureServer(): Promise<SsFixtureServer> {
  const state: SsFixtureState = { amountDue: SS_FIXTURE.valor, menuPresent: true, representationOption: true };
  const requests: string[] = [];

  const handler = (req: IncomingMessage, res: ServerResponse): void => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    requests.push(url.pathname + url.search);
    const menu = state.menuPresent ? '<a href="/ptss/pagamentos">Pagamentos e Dívidas</a>' : "";
    const html = (titulo: string, corpo: string): void => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(pagina(titulo, corpo).replace("__MENU__", menu));
    };

    switch (url.pathname) {
      case "/ptss/home":
        return html("SSD", "<h1>Bem-vindo à Segurança Social Direta</h1>");
      case "/ptss/pagamentos":
        return html(
          "Pagamentos e Dívidas",
          '<h1>Pagamentos e Dívidas</h1><ul><li><a href="/ptss/valores">Valores a pagar à Segurança Social</a></li><li><a href="/ptss/dividas">Dívidas</a></li></ul>',
        );
      case "/ptss/valores":
        return html(
          "Valores a pagar",
          '<h1>Valores a pagar à Segurança Social</h1><div role="tablist"><a role="tab" href="/ptss/valores?tab=situacao">Situação</a> <a role="tab" href="/ptss/valores/pagamentos">Pagamentos</a></div>',
        );
      case "/ptss/valores/pagamentos":
        return html(
          "Pagamentos",
          '<h1>Pagamentos</h1><p>Consulte e efetue pagamentos.</p><a href="/ptss/fazer-pagamento">Fazer pagamento</a>',
        );
      case "/ptss/fazer-pagamento": {
        const nomeProprio = url.searchParams.get("nomeProprio") === "1" || !state.representationOption;
        const opcao = state.representationOption
          ? '<form id="rep" method="get" action="/ptss/fazer-pagamento"><label><input type="checkbox" name="nomeProprio" value="1" onchange="this.form.submit()"' +
            (nomeProprio ? " checked" : "") +
            "> Pedir para atuar em nome próprio</label></form>"
          : "";
        if (!nomeProprio) return html("Fazer pagamento", `<h1>Fazer pagamento</h1>${opcao}<p>Selecione em nome de quem atua.</p>`);
        if (state.amountDue === null) {
          return html("Fazer pagamento", `<h1>Fazer pagamento</h1>${opcao}<p>Não existem valores a pagar.</p>`);
        }
        return html(
          "Fazer pagamento",
          `<h1>Fazer pagamento</h1>${opcao}<p>Valor a pagar: ${state.amountDue} €</p><form method="post" action="/ptss/pagar"><button type="submit">Pagar</button></form>`,
        );
      }
      case "/ptss/pagar":
        return html(
          "Meio de pagamento",
          '<h1>Escolha o meio de pagamento</h1><form method="post" action="/ptss/pagar/multibanco"><label><input type="radio" name="meio" value="mb"> Multibanco</label> <label><input type="radio" name="meio" value="dd"> Débito direto</label><button type="submit">Continuar</button></form>',
        );
      case "/ptss/pagar/multibanco":
        return html(
          "Referência Multibanco",
          `<h1>Pagamento por Multibanco</h1><p>Entidade: ${SS_FIXTURE.entidade}</p><p>Referência: 123 456 789</p><p>Valor: ${state.amountDue ?? "0,00"} €</p><a href="/ptss/documento.pdf">Obter documento de pagamento</a>`,
        );
      case "/ptss/documento.pdf":
        res.writeHead(200, {
          "content-type": "application/pdf",
          "content-disposition": 'attachment; filename="referencia-multibanco.pdf"',
        });
        return void res.end(PDF_DE_TESTE);
      default:
        res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
        return void res.end("<html><body>Página não encontrada</body></html>");
    }
  };

  const server: Server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    state,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
