import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AtFixtureServer } from "./fixture-server";

/**
 * O TOConline em miniatura para a rota A, servido em `127.0.0.1` — zero rede
 * externa. Modela só o que o Acesso Direto precisa: login do gabinete, a troca
 * de empresa ativa (`switchToEntityAndNotifyPages`) e a página do Sumário com o
 * menu «Acesso Direto», que fala com a extensão pelo **mesmo protocolo** da
 * TOConline Connect (`postMessage` com `type: btoa("platform")`).
 *
 * TODOS OS DADOS SÃO SINTÉTICOS. As credenciais do gabinete e as empresas são
 * inventadas para os testes.
 *
 * Fiel ao portal real no que importa ao adaptador:
 * - a aplicação vive em Shadow DOM (`<toc-app>`): o texto do menu e dos avisos
 *   NÃO aparece em `innerText`, só ao motor de texto do Playwright;
 * - a página só mostra o menu depois de a extensão responder ao handshake; sem
 *   resposta mostra «Instalar Extensão Chrome» — é a própria página que diz que
 *   a extensão não está lá;
 * - o guião entregue à extensão é o da AT de mentira (`fixture-server.ts`):
 *   URL de login, XPath dos campos e a senha que o teste escolheu.
 */

export const TOC_FIXTURE = {
  utilizador: "gabinete@example.pt",
  senha: "senha-do-gabinete-1971",
  /** Senha que devolve o formulário LIMPO — avaria transitória, não recusa. */
  senhaAvaria: "avaria-transitoria-do-portal",
} as const;

export interface TocFixtureState {
  cookieValido: string;
  /** A empresa ativa depois do último `switchToEntityAndNotifyPages`. */
  activeCompany: { id: number; cluster: number } | null;
  /** Todas as trocas de empresa pedidas à página, por ordem. */
  switches: { id: number; cluster: number }[];
  /** Mostra «Instalar Extensão Chrome» mesmo que a extensão responda. */
  extensionMissing: boolean;
  /** A senha da AT da empresa está gravada no TOConline? */
  passwordConfigured: boolean;
  /** O que a extensão vai escrever no formulário da AT. */
  atUsername: string;
  atPassword: string;
  /** A extensão fecha o separador logo a seguir ao guião (`closeTab` no follow). */
  closeTabAfterLogin: boolean;
  /** A página fala com a extensão mas sem `login`: nenhum separador abre. */
  noTab: boolean;
  visitas: { login: number; summary: number };
}

export interface TocFixtureServer {
  baseUrl: string;
  state: TocFixtureState;
  close(): Promise<void>;
}

const pagina = (titulo: string, corpo: string): string =>
  `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>${titulo}</title></head><body>${corpo}</body></html>`;

/** Rótulos do formulário real: «Palavra-passe» e «Credenciais de acesso» sem erro nenhum. */
const PAGINA_LOGIN = (erro = false): string =>
  pagina(
    "TOConline",
    `<h1>Credenciais de acesso</h1>
  <form method="POST" action="/login">
    <label for="email">Utilizador</label>
    <input id="email" type="email" name="email" />
    <label for="password">Palavra-passe</label>
    <input id="password" type="password" name="password" />
    <button type="button" onclick="this.form.submit()">Entrar</button>
  </form>
  <a href="/recuperar">Esqueceu-se da palavra-passe?</a>
  ${erro ? "<p>Credenciais inválidas.</p>" : ""}`,
  );

/**
 * A função global que troca a empresa ativa — numa SPA existe em qualquer
 * página autenticada, e é assim que o adaptador a chama (logo a seguir ao
 * login, antes de ir ao Sumário). Regista a troca no servidor para o teste a
 * poder ver.
 */
const SCRIPT_SWITCH_ENTITY = `
    window.switchToEntityAndNotifyPages = function (id, cluster) {
      return fetch("/switch-entity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, cluster }),
      });
    };`;

const PAGINA_EMPRESAS = pagina(
  "Empresas",
  `<toc-app></toc-app>
  <script>${SCRIPT_SWITCH_ENTITY}
    class TocApp extends HTMLElement { connectedCallback(){ this.attachShadow({mode:"open"}).innerHTML = "<h1>Empresas</h1><vaadin-grid></vaadin-grid>"; } }
    customElements.define("toc-app", TocApp);
  </script>`,
);

/**
 * O Sumário. O guião vai embutido como JSON porque é a página do TOConline que
 * o constrói (com a senha decifrada do seu lado) e o entrega à extensão — o
 * adaptador nunca o vê nem o constrói.
 */
function paginaSumario(state: TocFixtureState, at: AtFixtureServer): string {
  const empresa = state.activeCompany;
  const guiao = state.noTab
    ? { action: "login-fetch-logout", logout: { url: `${at.baseUrl}/logout`, timeout: 500 } }
    : {
        action: "login-fetch-logout",
        logout: { url: `${at.baseUrl}/logout`, timeout: 500 },
        login: {
          url: `${at.loginBaseUrl}/loginForm`,
          actions: [
            { type: "input-value", element: "//input[@name='username']", value: state.atUsername },
            {
              type: "input-value",
              element: "//input[@name='password']",
              value: state.atPassword,
              hidePassword: true,
            },
            { type: "element-click", element: "//button[@type='submit']" },
          ],
        },
        follow: state.closeTabAfterLogin ? [{ closeTab: true, closeTabTimeout: 0 }] : [{ resolve: true }],
        comeBack: true,
      };
  return pagina(
    "Sumário",
    `<toc-app></toc-app>
  <script>
    const PEDIDO = btoa("platform");
    const RESPOSTA = btoa("platform-extension");
    const GUIAO = ${JSON.stringify(guiao)};
    const FORCAR_SEM_EXTENSAO = ${state.extensionMissing ? "true" : "false"};
    const SENHA_GRAVADA = ${state.passwordConfigured ? "true" : "false"};
    const EMPRESA = ${JSON.stringify(empresa)};

    ${SCRIPT_SWITCH_ENTITY}

    class TocApp extends HTMLElement {
      connectedCallback() {
        this.raiz = this.attachShadow({ mode: "open" });
        this.raiz.innerHTML = "<h1>Sumário</h1><p id='a-carregar'>A carregar…</p>";
        this.handshake();
      }
      handshake() {
        const hash = "handshake-" + Math.random();
        let respondeu = false;
        const ouvinte = (e) => {
          if (e.source === window && e.data && e.data.type === RESPOSTA && e.data.promise === hash) respondeu = true;
        };
        window.addEventListener("message", ouvinte);
        let tentativas = 0;
        const tenta = () => {
          if (respondeu || tentativas >= 15) {
            window.removeEventListener("message", ouvinte);
            this.render(respondeu && !FORCAR_SEM_EXTENSAO);
            return;
          }
          tentativas += 1;
          window.postMessage({ type: PEDIDO, hash, hasExtension: false }, "*");
          setTimeout(tenta, 100);
        };
        tenta();
      }
      render(comExtensao) {
        const empresa = EMPRESA ? "Empresa " + EMPRESA.id + " (cluster " + EMPRESA.cluster + ")" : "Sem empresa ativa";
        if (!comExtensao) {
          this.raiz.innerHTML = "<h1>Sumário</h1><p>" + empresa + "</p><section><h2>Acesso Direto</h2><p>Para utilizar esta funcionalidade, instale a extensão.</p><button type='button'>Instalar Extensão Chrome</button></section>";
          return;
        }
        this.raiz.innerHTML = "<h1>Sumário</h1><p>" + empresa + "</p><nav><span class='menu'>Acesso Direto</span><ul><li><a href='#' id='pf'>Portal das Finanças</a></li><li><a href='#'>Segurança Social</a></li><li><a href='#'>Senhas da empresa</a></li></ul></nav><p id='estado'></p>";
        this.raiz.getElementById("pf").addEventListener("click", (ev) => {
          ev.preventDefault();
          this.acessoDireto();
        });
      }
      acessoDireto() {
        const estado = this.raiz.getElementById("estado");
        if (!SENHA_GRAVADA) {
          estado.textContent = "A senha da empresa não está configurada. Registe-a em Dados da empresa.";
          return;
        }
        const hash = "acesso-" + Math.random();
        const ouvinte = (e) => {
          if (e.source === window && e.data && e.data.type === RESPOSTA && e.data.promise === hash) {
            window.removeEventListener("message", ouvinte);
            estado.textContent = "Acesso Direto iniciado: " + JSON.stringify(e.data.response);
          }
        };
        window.addEventListener("message", ouvinte);
        window.postMessage({ type: PEDIDO, hash, payload: GUIAO }, "*");
      }
    }
    customElements.define("toc-app", TocApp);
  </script>`,
  );
}

function lerCorpo(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let corpo = "";
    req.on("data", (pedaco) => (corpo += pedaco));
    req.on("end", () => resolve(corpo));
  });
}

function html(res: ServerResponse, corpo: string, headers: Record<string, string> = {}): void {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", ...headers });
  res.end(corpo);
}

export async function startTocFixtureServer(at: AtFixtureServer): Promise<TocFixtureServer> {
  const state: TocFixtureState = {
    cookieValido: "1",
    activeCompany: null,
    switches: [],
    extensionMissing: false,
    passwordConfigured: true,
    atUsername: "501442600",
    atPassword: "boa",
    closeTabAfterLogin: false,
    noTab: false,
    visitas: { login: 0, summary: 0 },
  };

  const trata = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const autenticado = (req.headers.cookie ?? "").includes(`toc_sessao=${state.cookieValido}`);

    if (url.pathname === "/login" && req.method === "POST") {
      const params = new URLSearchParams(await lerCorpo(req));
      const senha = params.get("password");
      const ok = params.get("email") === TOC_FIXTURE.utilizador && senha === TOC_FIXTURE.senha;
      if (ok) {
        res.writeHead(302, { location: "/companies", "set-cookie": `toc_sessao=${state.cookieValido}; Path=/` });
        res.end();
        return;
      }
      // Avaria: devolve o formulário limpo, sem dizer que recusou.
      return html(res, PAGINA_LOGIN(senha !== TOC_FIXTURE.senhaAvaria));
    }

    if (url.pathname === "/login") {
      // Já autenticado: a aplicação real não mostra o login outra vez.
      if (autenticado) {
        res.writeHead(302, { location: "/companies" });
        res.end();
        return;
      }
      // Só navegações contam: o Chrome volta a pedir a URL da página como
      // imagem quando não encontra favicon, e o Playwright nem o reporta.
      if (req.headers["sec-fetch-dest"] !== "image") state.visitas.login += 1;
      return html(res, PAGINA_LOGIN());
    }

    if (!autenticado) {
      res.writeHead(302, { location: "/login" });
      res.end();
      return;
    }

    if (url.pathname === "/companies") return html(res, PAGINA_EMPRESAS);

    if (url.pathname === "/switch-entity" && req.method === "POST") {
      const { id, cluster } = JSON.parse(await lerCorpo(req)) as { id: number; cluster: number };
      state.activeCompany = { id, cluster };
      state.switches.push({ id, cluster });
      res.writeHead(204);
      res.end();
      return;
    }

    if (url.pathname === "/summary") {
      state.visitas.summary += 1;
      return html(res, paginaSumario(state, at));
    }

    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    res.end(pagina("Não encontrado", "<h1>404</h1>"));
  };

  const server: Server = createServer((req, res) => {
    void trata(req, res).catch(() => {
      res.writeHead(500);
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const endereco = server.address();
  const porta = typeof endereco === "object" && endereco !== null ? endereco.port : 0;

  return {
    baseUrl: `http://127.0.0.1:${porta}`,
    state,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
