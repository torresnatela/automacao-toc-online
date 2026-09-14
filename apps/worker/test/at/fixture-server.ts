import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Page } from "playwright";

/**
 * O Portal das Finanças em miniatura, servido em `127.0.0.1` — **zero rede
 * externa**, como o servidor local de `test/toconline/session.browser.test.ts`.
 *
 * TODOS OS DADOS AQUI SÃO SINTÉTICOS. Os NIFs (`501442600`, `111111111`,
 * `555555555`, `999999990`, `000000000`), a entidade `11111`, a referência e o
 * valor são inventados para os testes; nada disto pertence a contribuinte
 * nenhum e nada disto veio do portal real.
 *
 * ## Porquê DOIS servidores
 *
 * Na realidade o login vive em `www.acesso.gov.pt` e o portal do IVA em
 * `iva.portaldasfinancas.gov.pt` — hosts diferentes, e é dessa diferença que
 * `classifyAtPage` se serve para saber se está num ecrã de autenticação ou já
 * dentro do portal. Um servidor só, com um host só, colapsaria os dois
 * contextos: `loginHostPattern` e `portalHostPattern` teriam de casar o mesmo
 * host e o desafio de 2FA (que não tem campo de senha) passaria por página
 * desconhecida.
 *
 * Duas portas resolvem-no sem inventar DNS: `new URL(...).host` inclui a porta,
 * portanto `127.0.0.1:A` e `127.0.0.1:B` são hosts distintos para as regexes —
 * e os cookies, esses, **ignoram a porta** (RFC 6265), pelo que a sessão que o
 * servidor de login emite chega ao servidor do portal, tal como no SSO real.
 *
 * As redações das páginas foram escritas contra `src/at/wording.ts`: cada aviso
 * usa uma frase que os padrões de lá reconhecem, e o formulário nu leva de
 * propósito os rótulos ("Senha", "Código de segurança", "Alterar a
 * palavra-passe") que NÃO podem classificar nada.
 */

/**
 * O que a rota do documento de pagamento devolve.
 *
 * `attachment` / `inline` / `popup` são a lista completa, e dizem só COMO o
 * link da linha entrega o PDF. `none` é a lista com a tabela vazia; `notready`
 * é a lista sem a linha do período pedido; `paid` é a página SEM tabela, só
 * com o aviso — o caso em que o adaptador cai na redação.
 */
export type AtFixtureMode = "attachment" | "inline" | "popup" | "none" | "paid" | "notready";

/** Senhas com significado. Só `boa` autentica; as outras modelam cada recusa. */
export const SENHAS = {
  boa: "boa",
  errada: "errada",
  bloqueada: "bloqueada",
  doisFatores: "2fa",
  expirada: "expirada",
  /** Formulário devolvido NU, sem aviso nenhum: a avaria transitória do portal. */
  avaria: "avaria",
} as const;

/** NIFs sintéticos com significado para a seleção de cliente. */
export const NIFS = {
  bom: "501442600",
  /** O contabilista não está autorizado por este contribuinte. */
  semAutorizacao: "999999990",
  /** O portal abre a sessão de OUTRO contribuinte — a troca que a guarda apanha. */
  trocado: "555555555",
  /** O que o portal mostra quando o NIF pedido foi `555555555`. */
  trocadoMostrado: "111111111",
  /** Cliente sem declarações submetidas. */
  semDeclaracoes: "000000000",
} as const;

export interface AtFixtureState {
  /** Valor de cookie aceite. Rodá-lo invalida a sessão antiga sem impedir um login novo. */
  cookieValido: string;
  /** Que página o `obter-doc-pagamento` devolve. */
  mode: AtFixtureMode;
  /** Baralha a ordem das colunas da tabela de declarações. */
  reorderColumns: boolean;
  /** O ano com que a lista de `obter-doc-pagamento` abre (o filtro «Ano»). */
  anoInicial: string;
  /**
   * Faz o portal responder 503 com um corpo NEUTRO — sem uma palavra que
   * `wording.ts` reconheça. Só o código HTTP denuncia a avaria, que é o caso
   * que apanha um classificador que ignore o `status`.
   */
  serverError: boolean;
  /** A sessão morre entre a reutilização e a escolha do cliente. */
  sessaoMorreNaSelecao: boolean;
  /** As linhas da lista vêm sem o link de obter documento (seletor partido). */
  semBotao: boolean;
  /** O PDF servido em `/doc.pdf`. Gerado no `beforeAll` do teste, nunca no repo. */
  pdf: Buffer;
  /** O `ano` da última pesquisa na lista (`null` se o filtro nunca foi aplicado). */
  ultimoAno: string | null;
  /** O período da linha cujo PDF foi servido por último (`null` se nenhum). */
  ultimoDocumento: string | null;
  /** Contadores — provam que a sessão reutilizada NÃO passa pelo login. */
  visitas: {
    login: number;
    listaClientes: number;
    consultarDeclaracao: number;
    obterDocumento: number;
    pdf: number;
  };
}

export interface AtFixtureServer {
  /** Origem do portal do IVA (o `iva.portaldasfinancas.gov.pt` do real). */
  baseUrl: string;
  /** Origem do ecrã de autenticação (o `www.acesso.gov.pt` do real). */
  loginBaseUrl: string;
  state: AtFixtureState;
  close(): Promise<void>;
}

/* --------------------------------------------------------------------------
 * HTML. Template strings e não ficheiros: as páginas são curtas e dependem do
 * estado (cliente, modo, ordem das colunas), e mantê-las ao lado das redações
 * que elas têm de casar é o que evita que uma mudança em `wording.ts` passe
 * despercebida.
 * ----------------------------------------------------------------------- */

const pagina = (titulo: string, corpo: string): string =>
  `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>${titulo}</title></head><body>${corpo}</body></html>`;

/**
 * O formulário de autenticação, opcionalmente com um aviso.
 *
 * Os rótulos são os do portal real e são, de propósito, armadilhas para a
 * classificação: "Senha", "Código de segurança" e "Alterar a palavra-passe"
 * aparecem aqui sem que nada tenha corrido mal. Se algum deles classificasse a
 * página, uma credencial boa era marcada inválida.
 */
const FORMULARIO_LOGIN = (aviso = ""): string =>
  pagina(
    "Autenticação",
    `<h1>Autenticação</h1>
    ${aviso}
    <form method="POST" action="/loginForm">
      <label for="username">NIF</label>
      <input id="username" name="username" type="text" />
      <label for="password">Senha</label>
      <input id="password" name="password" type="password" />
      <label for="captcha">Código de segurança</label>
      <input id="captcha" name="captcha" type="text" />
      <button type="submit">Autenticar</button>
    </form>
    <a href="/recuperar">Alterar a palavra-passe</a>`,
  );

const PAGINA_2FA = pagina(
  "Autenticação em dois passos",
  `<h1>Autenticação em dois passos</h1>
  <p>Introduza o código de segurança enviado por SMS para o seu telemóvel.</p>
  <form method="POST" action="/loginForm">
    <input id="codigo" name="codigo" type="text" />
    <button type="submit">Confirmar</button>
  </form>`,
);

const PAGINA_SENHA_EXPIRADA = pagina(
  "Alteração de senha",
  `<h1>Alteração de senha</h1>
  <p>A sua senha expirou. Deve alterar a senha para continuar.</p>
  <form method="POST" action="/loginForm">
    <label for="nova">Nova senha</label>
    <input id="nova" name="nova" type="password" />
    <button type="submit">Alterar</button>
  </form>`,
);

const FORMULARIO_CLIENTE = `<form method="POST" action="/pagantiva/listaClientesToc/entrar">
    <label for="nif">NIF do contribuinte</label>
    <input id="nif" name="nif" type="text" />
    <button type="submit">Entrar</button>
  </form>`;

const PAGINA_CLIENTES = pagina(
  "Clientes",
  `<h1>Contribuintes representados</h1>${FORMULARIO_CLIENTE}`,
);

const PAGINA_SEM_AUTORIZACAO = pagina(
  "Clientes",
  `<h1>Contribuintes representados</h1>
  <p>Não tem autorização para aceder aos dados deste contribuinte.</p>
  ${FORMULARIO_CLIENTE}`,
);

/** O portal abriu a sessão de outro contribuinte — o pior desfecho silencioso. */
const PAGINA_CLIENTE_TROCADO = pagina(
  "Clientes",
  `<h1>Contribuinte selecionado</h1>
  <p>NIF: ${NIFS.trocadoMostrado}</p>
  ${FORMULARIO_CLIENTE}`,
);

/** As três linhas cobrem a substituição: o mesmo período entregue duas vezes. */
const DECLARACOES = [
  { periodo: "2026/06", entrega: "2026-08-18", tipo: "Normal" },
  { periodo: "2026/07", entrega: "2026-09-02", tipo: "Normal" },
  { periodo: "2026/07", entrega: "2026-09-03", tipo: "Substituição" },
] as const;

const paginaDeclaracoes = (nif: string, reordenar: boolean): string => {
  const cabecalho = reordenar
    ? ["Tipo", "Data de entrega", "Período"]
    : ["Período", "Data de entrega", "Tipo"];
  const linhas = DECLARACOES.map((linha) => {
    const celulas = reordenar
      ? [linha.tipo, linha.entrega, linha.periodo]
      : [linha.periodo, linha.entrega, linha.tipo];
    return `<tr>${celulas.map((c) => `<td>${c}</td>`).join("")}</tr>`;
  }).join("");
  return pagina(
    "Consultar declaração",
    `<h1>Declarações periódicas de IVA</h1>
    <p>NIF: ${nif}</p>
    <table>
      <thead><tr>${cabecalho.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
      <tbody>${linhas}</tbody>
    </table>`,
  );
};

const paginaSemDeclaracoes = (nif: string): string =>
  pagina(
    "Consultar declaração",
    `<h1>Declarações periódicas de IVA</h1>
    <p>NIF: ${nif}</p>
    <p>Não existem declarações periódicas para o período indicado.</p>`,
  );

/**
 * As declarações que a lista de `obter-doc-pagamento` mostra, por ano do
 * filtro. Sintéticas: a mistura de meses e trimestre no mesmo ano não existe
 * numa empresa real e serve só para exercitar os dois regimes no mesmo ecrã.
 * O período da linha traz SÓ o mês/trimestre — o ano é o do filtro, como no
 * portal real (reconhecimento de 2026-09-07).
 */
const LINHAS_DOCUMENTOS: Readonly<
  Record<string, readonly { id: string; periodo: string; rececao: string }[]>
> = {
  "2025": [{ id: "240011111111", periodo: "12", rececao: "2026-01-10 09:00:00" }],
  "2026": [
    { id: "240012345601", periodo: "06", rececao: "2026-07-10 09:00:00" },
    { id: "240012345602", periodo: "07", rececao: "2026-08-10 10:11:12" },
    { id: "240012345603", periodo: "3T", rececao: "2026-11-12 08:30:00" },
  ],
};

/**
 * A lista de `obter-doc-pagamento`: filtro de ano + uma declaração por linha,
 * cada uma com o seu «Obter documento de pagamento». Os campos da guia
 * (entidade, referência, valor) NÃO estão aqui — vivem dentro do PDF.
 *
 * O `aoClicar` muda com o modo porque o Chromium **sem cabeça não tem visor de
 * PDF**: qualquer navegação para `application/pdf` vira download, e os modos
 * `inline` e `popup` colapsavam todos no mesmo desfecho. Cada modo usa por isso
 * o mecanismo que, num browser sem visor, produz mesmo o caminho que quer
 * exercitar — `location.href` para o anexo, `fetch` para o corpo da resposta,
 * `window.open` para a janela nova. // TODO(recon): confirmar na Fase 0 qual
 * deles o portal usa de verdade e com que cabeçalhos.
 */
const paginaListaDocumentos = (
  ano: string,
  linhas: readonly { id: string; periodo: string; rececao: string }[],
  aoClicar: (url: string) => string,
  opcoes: { semBotao?: boolean } = {},
): string => {
  const anos = Object.keys(LINHAS_DOCUMENTOS)
    .map((a) => `<option value="${a}"${a === ano ? " selected" : ""}>${a}</option>`)
    .join("");
  const corpo = linhas
    .map((l) => {
      const gatilho =
        opcoes.semBotao === true
          ? "Documento indisponível"
          : `<a href="#" onclick="${aoClicar(`/doc.pdf?periodo=${l.periodo}`)}; return false">Obter documento de pagamento</a>`;
      return `<tr><td>${l.id}</td><td>${l.periodo}</td><td>${l.rececao}</td><td>${gatilho}</td></tr>`;
    })
    .join("");
  return pagina(
    "Obter documento de pagamento",
    `<h1>Obter documento de pagamento</h1>
    <form method="GET" action="/dpiva/portal/cc/obter-doc-pagamento">
      <label for="ano">Ano</label>
      <select id="ano" name="ano">${anos}</select>
      <button type="submit">Pesquisar</button>
    </form>
    <table>
      <thead><tr><th>Identificação</th><th>Período</th><th>Data de receção</th><th></th></tr></thead>
      <tbody>${corpo}</tbody>
    </table>`,
  );
};

/**
 * O 503 sem pistas: nem "em manutenção", nem "temporariamente indisponível",
 * nem "erro interno do servidor". Nada aqui casa com `wording.ts` — a única
 * prova de que o portal está em baixo é o código HTTP.
 */
const PAGINA_503 = pagina(
  "Serviço indisponível",
  `<h1>Serviço indisponível</h1><p>Por favor tente novamente mais tarde.</p>`,
);

/** Sem tabela nenhuma: só o aviso. É a redação que o adaptador tem de ler. */
const PAGINA_JA_PAGO = pagina(
  "Obter documento de pagamento",
  `<h1>Documento de pagamento</h1><p>O IVA deste período já foi pago.</p>`,
);

/* -------------------------------------------------------------------------- */

function lerCookies(req: IncomingMessage): Record<string, string> {
  const cru = req.headers.cookie ?? "";
  const pares: Record<string, string> = {};
  for (const parte of cru.split(";")) {
    const igual = parte.indexOf("=");
    if (igual === -1) continue;
    pares[parte.slice(0, igual).trim()] = parte.slice(igual + 1).trim();
  }
  return pares;
}

function lerCorpo(req: IncomingMessage): Promise<URLSearchParams> {
  return new Promise((resolve) => {
    let corpo = "";
    req.on("data", (pedaco) => (corpo += pedaco));
    req.on("end", () => resolve(new URLSearchParams(corpo)));
  });
}

function html(res: ServerResponse, corpo: string, headers: Record<string, string> = {}): void {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", ...headers });
  res.end(corpo);
}

function redireciona(
  res: ServerResponse,
  para: string,
  headers: Record<string, string> = {},
): void {
  res.writeHead(302, { location: para, ...headers });
  res.end();
}

function porta(server: Server): number {
  const endereco = server.address();
  return typeof endereco === "object" && endereco !== null ? endereco.port : 0;
}

function ouvir(server: Server): Promise<void> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
}

function fechar(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

export async function startAtFixtureServer(): Promise<AtFixtureServer> {
  const state: AtFixtureState = {
    cookieValido: "1",
    mode: "attachment",
    reorderColumns: false,
    anoInicial: "2026",
    serverError: false,
    sessaoMorreNaSelecao: false,
    semBotao: false,
    pdf: Buffer.alloc(0),
    ultimoAno: null,
    ultimoDocumento: null,
    visitas: { login: 0, listaClientes: 0, consultarDeclaracao: 0, obterDocumento: 0, pdf: 0 },
  };

  // As origens só se sabem depois do `listen`; o handler lê-as daqui.
  const origens = { login: "", portal: "" };

  const trata = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const caminho = url.pathname;
    const cookies = lerCookies(req);
    const autenticado = cookies["sessao"] === state.cookieValido;
    const cliente = cookies["cliente"] ?? NIFS.bom;

    // --- acesso.gov.pt ------------------------------------------------------
    if (caminho === "/loginForm") {
      if (req.method === "POST") {
        if (state.serverError) {
          res.writeHead(503, { "content-type": "text/html; charset=utf-8" });
          res.end(PAGINA_503);
          return;
        }
        const corpo = await lerCorpo(req);
        const senha = corpo.get("password");
        switch (senha) {
          case SENHAS.boa:
            return redireciona(res, `${origens.portal}/dpiva/portal/cc/consultar-declaracao`, {
              "set-cookie": `sessao=${state.cookieValido}; Path=/`,
            });
          case SENHAS.bloqueada:
            return html(
              res,
              FORMULARIO_LOGIN("<p>O acesso encontra-se bloqueado por excesso de tentativas.</p>"),
            );
          case SENHAS.doisFatores:
            return html(res, PAGINA_2FA);
          case SENHAS.expirada:
            return html(res, PAGINA_SENHA_EXPIRADA);
          case SENHAS.avaria:
            // Formulário limpo, sem dizer que recusou: é a avaria transitória.
            return html(res, FORMULARIO_LOGIN());
          default:
            return html(
              res,
              FORMULARIO_LOGIN(
                "<p>Ocorreu um erro na tentativa de autenticação! Erro: tem mais 2 tentativas.</p>",
              ),
            );
        }
      }
      state.visitas.login += 1;
      return html(res, FORMULARIO_LOGIN());
    }

    // --- portaldasfinancas.gov.pt (tudo daqui para baixo exige sessão) ------
    if (!autenticado) return redireciona(res, `${origens.login}/loginForm`);

    // Interruptor de teste: qualquer página do portal pode responder "sem
    // autorização", que é como a AT reage a meio de um fluxo quando o
    // contabilista perde a representação do contribuinte.
    if (url.searchParams.get("semAutorizacao") === "1") {
      return html(res, PAGINA_SEM_AUTORIZACAO);
    }

    if (caminho === "/pagantiva/listaClientesToc/entrar") {
      // A sessão morre DEPOIS de a reutilização ter passado: o cookie ainda
      // servia para consultar a declaração e já não serve para escolher.
      if (state.sessaoMorreNaSelecao) return redireciona(res, `${origens.login}/loginForm`);
      if (state.serverError) {
        res.writeHead(503, { "content-type": "text/html; charset=utf-8" });
        res.end(PAGINA_503);
        return;
      }
      if (req.method === "POST") {
        const corpo = await lerCorpo(req);
        const nif = corpo.get("nif") ?? "";
        if (nif === NIFS.semAutorizacao) return html(res, PAGINA_SEM_AUTORIZACAO);
        if (nif === NIFS.trocado) return html(res, PAGINA_CLIENTE_TROCADO);
        return redireciona(res, "/dpiva/portal/cc/consultar-declaracao", {
          "set-cookie": `cliente=${nif}; Path=/`,
        });
      }
      state.visitas.listaClientes += 1;
      return html(res, PAGINA_CLIENTES);
    }

    // Os dois caminhos (contabilista certificado e contribuinte direto) servem
    // a mesma página: o que os distingue é o URL por onde o adaptador lá chega.
    if (
      caminho === "/dpiva/portal/cc/consultar-declaracao" ||
      caminho === "/dpiva/portal/consultar-declaracao"
    ) {
      state.visitas.consultarDeclaracao += 1;
      return html(
        res,
        cliente === NIFS.semDeclaracoes
          ? paginaSemDeclaracoes(cliente)
          : paginaDeclaracoes(cliente, state.reorderColumns),
      );
    }

    if (
      caminho === "/dpiva/portal/cc/obter-doc-pagamento" ||
      caminho === "/dpiva/portal/obter-doc-pagamento"
    ) {
      state.visitas.obterDocumento += 1;
      // O filtro é um GET: a lista abre no `anoInicial` e «Pesquisar» volta cá
      // com `?ano=`. Só a pesquisa conta como "o filtro foi aplicado".
      const anoPedido = url.searchParams.get("ano");
      if (anoPedido !== null) state.ultimoAno = anoPedido;
      const ano = anoPedido ?? state.anoInicial;
      const modo = (url.searchParams.get("mode") as AtFixtureMode | null) ?? state.mode;
      if (modo === "paid") return html(res, PAGINA_JA_PAGO);
      const todas = LINHAS_DOCUMENTOS[ano] ?? [];
      const linhas =
        modo === "none" ? [] : modo === "notready" ? todas.filter((l) => l.periodo !== "07") : todas;
      const aoClicar =
        modo === "popup"
          ? (u: string) => `window.open('${u}')`
          : modo === "inline"
            ? (u: string) => `fetch('${u}')`
            : (u: string) => `location.href='${u}'`;
      return html(res, paginaListaDocumentos(ano, linhas, aoClicar, { semBotao: state.semBotao }));
    }

    if (caminho === "/doc.pdf") {
      // A janela nova NAVEGA para aqui (e um browser sem visor descarregaria o
      // ficheiro); um pedido direto — o `context.request.get` da estratégia do
      // popup — não. Servir a moldura a um e o ficheiro ao outro é o que faz o
      // portal real valer a pena re-pedir a URL pelo contexto autenticado em
      // vez de tentar ler os bytes de dentro da janela.
      const navegacao = (req.headers.accept ?? "").includes("text/html");
      if (state.mode === "popup" && navegacao) {
        return html(res, pagina("Documento", "<h1>Documento de pagamento</h1>"));
      }
      state.visitas.pdf += 1;
      state.ultimoDocumento = url.searchParams.get("periodo");
      const cabecalhos: Record<string, string> = {
        "content-type": "application/pdf",
        "content-length": String(state.pdf.length),
      };
      // Só o modo `attachment` força o download; nos outros o PDF abre no visor.
      if (state.mode === "attachment") {
        cabecalhos["content-disposition"] = 'attachment; filename="guia-iva.pdf"';
      }
      res.writeHead(200, cabecalhos);
      res.end(state.pdf);
      return;
    }

    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    res.end(pagina("Não encontrado", "<h1>404</h1>"));
  };

  const aoPedido = (req: IncomingMessage, res: ServerResponse): void => {
    void trata(req, res).catch(() => {
      res.writeHead(500);
      res.end();
    });
  };

  const login = createServer(aoPedido);
  const portal = createServer(aoPedido);
  await ouvir(login);
  await ouvir(portal);
  origens.login = `http://127.0.0.1:${porta(login)}`;
  origens.portal = `http://127.0.0.1:${porta(portal)}`;

  return {
    baseUrl: origens.portal,
    loginBaseUrl: origens.login,
    state,
    close: async () => {
      await fechar(login);
      await fechar(portal);
    },
  };
}

/** As regexes de host que os testes injetam em `AtOptions`. */
export function padroesDeHost(fixture: AtFixtureServer): {
  loginHostPattern: RegExp;
  portalHostPattern: RegExp;
} {
  return {
    loginHostPattern: new RegExp(`^${new URL(fixture.loginBaseUrl).host.replace(/\./g, "\\.")}$`),
    portalHostPattern: new RegExp(`^${new URL(fixture.baseUrl).host.replace(/\./g, "\\.")}$`),
  };
}

/**
 * Gera um PDF de verdade (≥ 1 KB) com o próprio Chromium — nada binário entra
 * no repositório. `page.pdf()` é legítimo AQUI (produzir uma fixture); no
 * adaptador é proibido, porque lá renderizaria o visor em vez do documento.
 */
export async function gerarPdfSintetico(page: Page): Promise<Buffer> {
  const paragrafos = Array.from(
    { length: 30 },
    (_, i) => `<p>Linha sintética ${i} — documento de teste, sem qualquer dado real.</p>`,
  ).join("");
  await page.setContent(
    `<!doctype html><html lang="pt"><body><h1>Guia</h1><p>NIF: ${NIFS.bom}</p><p>Período: 2026/07</p>${paragrafos}</body></html>`,
  );
  return page.pdf({ format: "A4" });
}
