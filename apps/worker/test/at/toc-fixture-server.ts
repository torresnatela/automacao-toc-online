import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AtFixtureServer } from "./fixture-server";

/**
 * O TOConline em miniatura para a rota A, servido em `127.0.0.1` — zero rede
 * externa. Modela o que se observou na aplicação real em 2026-09-06 e de que o
 * adaptador depende:
 *
 * - login do gabinete (`/login` → `/companies`);
 * - uma SPA `<toc-app>` em Shadow DOM com `session_data` (`session_loaded`,
 *   `entity_id`), o método `switchToEntityAndNotifyPages(id, url)` (troca a
 *   empresa ativa e faz uma navegação COMPLETA para `url`) e `changeRoute(url)`;
 * - a página `/vault-actions` (Acesso Direto): entidade «Portal das Finanças -
 *   Autoridade Tributária e Aduaneira» e a ação «DPIVA - Obter documento de
 *   pagamento», com a classe `valid` quando a senha está gravada, e o cofre em
 *   `window.vault.accesses.company.AT`;
 * - o handshake com a extensão pelo **mesmo protocolo** da TOConline Connect
 *   (`postMessage` com `type: btoa("platform")`), e sem resposta a página pede
 *   para instalar a extensão.
 *
 * TODOS OS DADOS SÃO SINTÉTICOS.
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
  activeCompany: { id: number; url: string } | null;
  /** Todas as trocas de empresa pedidas à página, por ordem. */
  switches: { id: number; url: string }[];
  /** Mostra «Instalar Extensão Chrome» mesmo que a extensão responda. */
  extensionMissing: boolean;
  /** A senha da AT da empresa está gravada no cofre? */
  passwordConfigured: boolean;
  /** O que a extensão vai escrever no formulário da AT. */
  atUsername: string;
  atPassword: string;
  /** A extensão fecha o separador logo a seguir ao guião (`closeTab` no follow). */
  closeTabAfterLogin: boolean;
  /** A página fala com a extensão mas sem `login`: nenhum separador abre. */
  noTab: boolean;
  /** Quanto a app demora a dar `session_loaded` (ms). */
  sessionDelayMs: number;
  /** Nº de carregamentos que ficam presos na «Validação de sessão» (o reload liberta). */
  staysValidatingFor: number;
  /** Interno: este carregamento em concreto fica preso? (o servidor calcula-o). */
  stuckThisLoad: boolean;
  visitas: { login: number; vaultActions: number };
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
 * A shell da SPA, igual em todas as rotas autenticadas: quem decide o que se
 * vê é o `pathname`, como na aplicação real (`iron-pages`). O guião da
 * extensão vai embutido como JSON porque é a página do TOConline que o
 * constrói (com a senha decifrada do seu lado) — o adaptador nunca o vê.
 */
function shell(state: TocFixtureState, at: AtFixtureServer): string {
  const guiao = state.noTab
    ? { action: "login-fetch-logout", logout: { url: `${at.baseUrl}/logout`, timeout: 500 } }
    : {
        action: "login-fetch-logout",
        logout: { url: `${at.baseUrl}/logout`, timeout: 500 },
        login: {
          url: `${at.loginBaseUrl}/loginForm`,
          actions: [
            { type: "input-value", element: "//input[@name='username']", value: state.atUsername },
            { type: "input-value", element: "//input[@name='password']", value: state.atPassword, hidePassword: true },
            { type: "element-click", element: "//button[@type='submit']" },
          ],
        },
        follow: state.closeTabAfterLogin ? [{ closeTab: true, closeTabTimeout: 0 }] : [{ resolve: true }],
        comeBack: true,
      };
  return pagina(
    "TOConline",
    `<toc-app></toc-app>
  <script>
    const PEDIDO = btoa("platform");
    const RESPOSTA = btoa("platform-extension");
    const GUIAO = ${JSON.stringify(guiao)};
    const FORCAR_SEM_EXTENSAO = ${state.extensionMissing ? "true" : "false"};
    const SENHA_GRAVADA = ${state.passwordConfigured ? "true" : "false"};
    const EMPRESA = ${JSON.stringify(state.activeCompany)};
    const ATRASO_SESSAO = ${state.sessionDelayMs};
    // Quando presa, a app fica em «Validação de sessão em curso» e nunca marca
    // session_loaded — modela o vaivém 401 que o adaptador corta com um reload.
    const PRESA = ${state.stuckThisLoad ? "true" : "false"};

    // O cofre, como na app real: um objeto global com os acessos da empresa.
    window.vault = {
      type: EMPRESA ? "company" : null,
      accesses: EMPRESA && SENHA_GRAVADA ? { company: { AT: { username: "5#######", valid: true } } } : {},
    };

    class TocApp extends HTMLElement {
      constructor() {
        super();
        this.session_data = { session_loaded: false, entity_id: null };
      }
      connectedCallback() {
        this.raiz = this.attachShadow({ mode: "open" });
        this.raiz.innerHTML = "<div id='overlay'>Validação de sessão em curso</div>";
        if (PRESA) return; // fica presa na validação: só um reload a liberta
        setTimeout(() => {
          this.session_data = { session_loaded: true, entity_id: EMPRESA ? EMPRESA.id : null };
          this.render();
        }, ATRASO_SESSAO);
      }
      // A troca de empresa: regista no servidor e faz uma navegação COMPLETA.
      async switchToEntityAndNotifyPages(id, url) {
        await fetch("/switch-entity", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: Number(id), url }),
        });
        window.location.assign(url);
      }
      changeRoute(url) {
        history.pushState({}, "", url);
        this.render();
      }
      render() {
        const path = window.location.pathname;
        const cabecalho = "<nav><span>Área de contabilista</span> <span>Empresa</span></nav>";
        if (path === "/vault-actions" && EMPRESA) {
          this.raiz.innerHTML = cabecalho + "<h1>Acesso Direto</h1><p id='estado'></p><div id='cofre'>A carregar…</div>";
          this.handshake();
          return;
        }
        if (path === "/my_company/summary" && EMPRESA) {
          this.raiz.innerHTML = cabecalho + "<h1>Sumário</h1><p>Empresa " + EMPRESA.id + "</p>";
          return;
        }
        this.raiz.innerHTML = cabecalho + "<h1>Empresas</h1><vaadin-grid></vaadin-grid>";
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
            this.renderCofre(respondeu && !FORCAR_SEM_EXTENSAO);
            return;
          }
          tentativas += 1;
          window.postMessage({ type: PEDIDO, hash, hasExtension: null }, "*");
          setTimeout(tenta, 100);
        };
        tenta();
      }
      renderCofre(comExtensao) {
        const cofre = this.raiz.getElementById("cofre");
        if (!comExtensao) {
          cofre.innerHTML = "<p>Para utilizar esta funcionalidade, instale a extensão.</p><button type='button'>Instalar Extensão Chrome</button>";
          return;
        }
        const classe = SENHA_GRAVADA ? "valid" : "invalid";
        cofre.innerHTML =
          "<div><a href='/vault-company'>Definir senhas da Empresa</a></div>" +
          "<vaadin-grid><vaadin-grid-cell-content><a href='#' id='entidade-at'><span class='entity_title " + classe + "'>Portal das Finanças - Autoridade Tributária e Aduaneira</span></a></vaadin-grid-cell-content>" +
          "<vaadin-grid-cell-content><div><a href='#' class='action_title " + classe + "' id='dpiva-proof'>DPIVA - Obter comprovativo</a></div>" +
          "<div><a href='#' class='action_title " + classe + "' id='dpiva-doc'>DPIVA - Obter documento de pagamento</a></div></vaadin-grid-cell-content></vaadin-grid>";
        // O clique real é na ENTIDADE (abre a AT); a ação DPIVA fica na grelha
        // mas não é o que o adaptador usa.
        this.raiz.getElementById("entidade-at").addEventListener("click", (ev) => { ev.preventDefault(); this.invocar(); });
      }
      invocar() {
        const estado = this.raiz.getElementById("estado");
        if (!SENHA_GRAVADA) {
          estado.textContent = "Não existe informação de acesso para esta entidade. Defina as senhas da empresa.";
          return;
        }
        const hash = "acesso-" + Math.random();
        const ouvinte = (e) => {
          if (e.source === window && e.data && e.data.type === RESPOSTA && e.data.promise === hash) {
            window.removeEventListener("message", ouvinte);
            estado.textContent = "Acesso Direto iniciado";
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
    sessionDelayMs: 300,
    staysValidatingFor: 0,
    stuckThisLoad: false,
    visitas: { login: 0, vaultActions: 0 },
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

    if (url.pathname === "/favicon.ico") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (!autenticado) {
      res.writeHead(302, { location: "/login" });
      res.end();
      return;
    }

    if (url.pathname === "/switch-entity" && req.method === "POST") {
      const { id, url: destino } = JSON.parse(await lerCorpo(req)) as { id: number; url: string };
      state.activeCompany = { id, url: destino };
      state.switches.push({ id, url: destino });
      res.writeHead(204);
      res.end();
      return;
    }

    if (url.pathname === "/vault-actions") state.visitas.vaultActions += 1;
    // Este carregamento fica preso na validação? Consome um do contador — o
    // reload do adaptador serve a shell de novo, já sem estar presa.
    state.stuckThisLoad = state.staysValidatingFor > 0;
    if (state.stuckThisLoad) state.staysValidatingFor -= 1;
    return html(res, shell(state, at));
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
