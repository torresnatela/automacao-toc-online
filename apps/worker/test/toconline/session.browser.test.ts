import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, type Server } from "node:http";
import { chromium, type Browser } from "playwright";
import { PlaywrightTocSessions, assertTocHost } from "../../src/toconline/session";
import { InMemoryStorageStateStore } from "../../src/toconline/storage-state";
import { InvalidCredentialsError, StructuralError } from "../../src/errors";
import type { BrowserProvider } from "../../src/browser/browser";
import type { StorageState } from "../../src/toconline/storage-state";

const skip = process.env.SKIP_BROWSER_TESTS === "1";

const UTILIZADOR = "gabinete@example.pt";
const SENHA = "senha-do-gabinete-1971";
/**
 * Senha que faz o servidor devolver a página de login **sem qualquer indício de
 * erro** — a avaria transitória do portal (sessão perdida, WAF, 5xx mascarado).
 * É o caso que separa "não concluiu" de "foi recusado".
 */
const SENHA_AVARIA = "avaria-transitoria-do-portal";

let browser: Browser;
let server: Server;
let baseUrl = "";

/** Contadores para provar que a sessão reutilizada NÃO passa pelo login. */
const visitas = { login: 0, companies: 0 };
/**
 * Valor de cookie aceite pelo servidor. Rodá-lo invalida a sessão ANTIGA sem
 * impedir que um login novo emita uma válida — que é como a expiração se
 * comporta na realidade.
 */
let cookieValido = "1";

/**
 * Fiel ao portal real nos **rótulos**: o formulário do TOConline escreve
 * "Palavra-passe" e "Credenciais de acesso" na própria página, sem erro nenhum.
 * É por isso que procurar só o substantivo classifica um formulário em branco
 * como recusa — e é isso que este fixture tem de conseguir provar.
 */
const PAGINA_LOGIN = (erro = false) => `<!doctype html><html lang="pt"><body>
  <h1>Credenciais de acesso</h1>
  <form method="POST" action="/login">
    <label for="email">Utilizador</label>
    <input id="email" type="email" name="email" />
    <label for="password">Palavra-passe</label>
    <input id="password" type="password" name="password" />
    <button type="button" onclick="this.form.submit()">Entrar</button>
  </form>
  <a href="/recuperar">Esqueceu-se da palavra-passe?</a>
  ${erro ? "<p>Credenciais inválidas.</p>" : ""}
</body></html>`;

const PAGINA_EMPRESAS = `<!doctype html><html lang="pt"><body>
  <toc-app></toc-app>
  <script>
    class VaadinGrid extends HTMLElement {
      constructor(){ super(); this.items = [{ id: 1, tax_number: "501442600", name: "Empresa", cluster: 5, status: "active", i18n_status: "Ativa", demo: false, accounting: true, roles: "x" }]; this.size = 1; this.attachShadow({mode:"open"}); }
    }
    class TocApp extends HTMLElement { connectedCallback(){ this.attachShadow({mode:"open"}).innerHTML = "<vaadin-grid></vaadin-grid>"; } }
    customElements.define("vaadin-grid", VaadinGrid);
    customElements.define("toc-app", TocApp);
  </script>
</body></html>`;

function startServer(): Promise<string> {
  return new Promise((resolve) => {
    server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const autenticado = (req.headers.cookie ?? "").includes(`toc_sessao=${cookieValido}`);

      if (url.pathname === "/login" && req.method === "POST") {
        let corpo = "";
        req.on("data", (c) => (corpo += c));
        req.on("end", () => {
          const params = new URLSearchParams(corpo);
          const senha = params.get("password");
          const ok = params.get("email") === UTILIZADOR && senha === SENHA;
          if (ok) {
            res.writeHead(302, {
              location: "/companies",
              "set-cookie": `toc_sessao=${cookieValido}; Path=/`,
            });
            res.end();
          } else {
            res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
            // Avaria: devolve o formulário limpo, sem dizer que recusou.
            res.end(PAGINA_LOGIN(senha !== SENHA_AVARIA));
          }
        });
        return;
      }

      if (url.pathname === "/login") {
        visitas.login += 1;
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(PAGINA_LOGIN());
        return;
      }

      if (url.pathname === "/companies") {
        if (!autenticado) {
          res.writeHead(302, { location: "/login" });
          res.end();
          return;
        }
        visitas.companies += 1;
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(PAGINA_EMPRESAS);
        return;
      }

      res.writeHead(404);
      res.end();
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve(`http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`);
    });
  });
}

/** Adaptador mínimo do BrowserProvider por cima do Playwright real. */
function provider(): BrowserProvider {
  return {
    async newContext(options: { storageState?: StorageState } = {}) {
      return browser.newContext({ storageState: options.storageState });
    },
    async close() {},
  };
}

function sessions(state = new InMemoryStorageStateStore()) {
  return {
    state,
    factory: new PlaywrightTocSessions(
      { browser: provider(), state },
      {
        loginUrl: `${baseUrl}/login`,
        hostPattern: /^127\.0\.0\.1(:\d+)?$/,
        timeoutMs: 8_000,
      },
    ),
  };
}

beforeAll(async () => {
  if (skip) return;
  browser = await chromium.launch({ headless: true });
  baseUrl = await startServer();
}, 60_000);

afterAll(async () => {
  await browser?.close();
  server?.close();
});

beforeEach(() => {
  visitas.login = 0;
  visitas.companies = 0;
  cookieValido = "1";
});

describe("assertTocHost", () => {
  it("aceita os hosts shardados do TOConline", () => {
    expect(assertTocHost("https://app5.toconline.pt/companies")).toBe("app5.toconline.pt");
    expect(assertTocHost("https://app.toconline.pt/companies")).toBe("app.toconline.pt");
    expect(assertTocHost("https://app11.toconline.pt/x")).toBe("app11.toconline.pt");
  });

  it("recusa um redirect para fora do TOConline", () => {
    expect(() => assertTocHost("https://phishing.example.com/")).toThrow(StructuralError);
  });

  it("recusa uma URL inválida", () => {
    expect(() => assertTocHost("nao é url")).toThrow(StructuralError);
  });
});

describe.skipIf(skip)("PlaywrightTocSessions (browser + servidor local)", () => {
  it("autentica e guarda o storageState", async () => {
    const { factory, state } = sessions();

    const opened = await factory.open({
      credentialId: "cred-1",
      credentials: { username: UTILIZADOR, password: SENHA },
    });

    expect(opened.reused).toBe(false);
    expect(opened.session.host).toMatch(/^127\.0\.0\.1/);
    const guardado = await state.load("toconline:cred-1");
    expect(guardado?.state.cookies?.some((c) => c.name === "toc_sessao")).toBe(true);
    await opened.session.close();
  }, 30_000);

  it("reutiliza a sessão guardada sem voltar a passar pelo login", async () => {
    const { factory } = sessions();
    const primeira = await factory.open({
      credentialId: "cred-1",
      credentials: { username: UTILIZADOR, password: SENHA },
    });
    await primeira.session.close();

    visitas.login = 0;
    const segunda = await factory.open({
      credentialId: "cred-1",
      credentials: { username: UTILIZADOR, password: SENHA },
    });

    expect(segunda.reused).toBe(true);
    expect(visitas.login).toBe(0);
    await segunda.session.close();
  }, 30_000);

  it("sessão expirada é descartada e o login refeito", async () => {
    const { factory, state } = sessions();
    const primeira = await factory.open({
      credentialId: "cred-1",
      credentials: { username: UTILIZADOR, password: SENHA },
    });
    await primeira.session.close();

    // O servidor passa a aceitar só um cookie novo: o guardado morreu.
    cookieValido = "2";
    visitas.login = 0;

    const segunda = await factory.open({
      credentialId: "cred-1",
      credentials: { username: UTILIZADOR, password: SENHA },
    });

    expect(segunda.reused).toBe(false);
    expect(visitas.login).toBeGreaterThan(0);
    const guardado = await state.load("toconline:cred-1");
    expect(guardado?.state.cookies?.some((c) => c.value === "2")).toBe(true);
    await segunda.session.close();
  }, 30_000);

  it("credenciais rejeitadas → InvalidCredentialsError, sem expor a senha", async () => {
    const { factory } = sessions();

    const erro = await factory
      .open({ credentialId: "cred-1", credentials: { username: UTILIZADOR, password: "errada" } })
      .then(() => null)
      .catch((e) => e as Error);

    expect(erro).toBeInstanceOf(InvalidCredentialsError);
    const superficie = `${String(erro)}\n${erro?.stack ?? ""}`;
    expect(superficie).not.toContain("errada");
    expect(superficie).not.toContain(SENHA);
  }, 30_000);

  it("timeout sem indício visível → erro retentável, NUNCA InvalidCredentialsError", async () => {
    const { factory } = sessions();

    const erro = await factory
      .open({
        credentialId: "cred-1",
        credentials: { username: UTILIZADOR, password: SENHA_AVARIA },
      })
      .then(() => null)
      .catch((e) => e as Error);

    // O formulário diz "Palavra-passe" e "Credenciais de acesso" por natureza.
    // Ler isso como recusa marcaria a credencial inválida e faria TODOS os jobs
    // seguintes serem ignorados — o dano exato que a classificação evita.
    expect(erro).toBeInstanceOf(Error);
    expect(erro).not.toBeInstanceOf(InvalidCredentialsError);
    expect(erro).not.toBeInstanceOf(StructuralError);
  }, 30_000);

  it("a senha nunca entra numa URL", async () => {
    const { factory } = sessions();
    const opened = await factory.open({
      credentialId: "cred-1",
      credentials: { username: UTILIZADOR, password: SENHA },
    });

    expect(opened.session.page.url()).not.toContain(SENHA);
    await opened.session.close();
  }, 30_000);
});
