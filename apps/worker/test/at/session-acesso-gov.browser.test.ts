import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { AcessoGovAtSessions } from "../../src/at/session-acesso-gov";
import { AtAuthError, AtIntegrityError, AtTransientError, StructuralError } from "../../src/errors";
import { InMemoryStorageStateStore, type StorageState } from "../../src/toconline/storage-state";
import type { BrowserProvider } from "../../src/browser/browser";
import type { AtCompanyHandle, CredentialScope } from "../../src/runner/ports";
import {
  NIFS,
  SENHAS,
  padroesDeHost,
  startAtFixtureServer,
  type AtFixtureServer,
} from "./fixture-server";

/**
 * Browser real contra o Portal das Finanças de mentira — zero rede externa.
 *
 * O que só aqui se prova: que a família de login é classificada DEPOIS do
 * redirect (e não pelo caminho da URL), que a sessão guardada evita o segundo
 * login, e que a senha não escapa por URL nenhuma.
 */
const skip = process.env.SKIP_BROWSER_TESTS === "1";

const UTILIZADOR = "123456789";
const EQUIPA = "equipa-1";

let browser: Browser;
let fixture: AtFixtureServer;
/** Todas as URLs pedidas pelo browser, para provar que a senha não vai em nenhuma. */
let pedidos: string[] = [];
let contextos: BrowserContext[] = [];

function empresa(nif: string | null = NIFS.bom): AtCompanyHandle {
  return { id: "emp-1", nif, tocCompanyId: null, tocCluster: null };
}

const ESCOPO_CC: CredentialScope = { teamId: EQUIPA, companyId: null };
const ESCOPO_EMPRESA: CredentialScope = { teamId: EQUIPA, companyId: "emp-1" };

/** Adaptador mínimo do BrowserProvider por cima do Playwright real. */
function provider(): BrowserProvider {
  return {
    async newContext(options: { storageState?: StorageState; acceptDownloads?: boolean } = {}) {
      const context = await browser.newContext({
        storageState: options.storageState,
        acceptDownloads: options.acceptDownloads,
      });
      context.on("request", (req) => pedidos.push(req.url()));
      contextos.push(context);
      return context;
    },
    async close() {},
  };
}

function sessions(state = new InMemoryStorageStateStore(), timeoutMs = 8_000) {
  return {
    state,
    factory: new AcessoGovAtSessions(
      { browser: provider(), state },
      { loginUrl: `${fixture.loginBaseUrl}/loginForm`, ...padroesDeHost(fixture), timeoutMs },
    ),
  };
}

function abrir(
  factory: AcessoGovAtSessions,
  opts: { password?: string; company?: AtCompanyHandle; scope?: CredentialScope } = {},
) {
  return factory.open({
    company: opts.company ?? empresa(),
    credentialId: "cred-at-1",
    credentials: { username: UTILIZADOR, password: opts.password ?? SENHAS.boa },
    scope: opts.scope ?? ESCOPO_CC,
  });
}

async function erroDe(promessa: Promise<unknown>): Promise<Error | null> {
  return promessa.then(
    () => null,
    (e: unknown) => e as Error,
  );
}

beforeAll(async () => {
  if (skip) return;
  browser = await chromium.launch({ headless: true });
  fixture = await startAtFixtureServer();
}, 60_000);

afterAll(async () => {
  await browser?.close();
  await fixture?.close();
});

beforeEach(() => {
  if (skip) return;
  pedidos = [];
  contextos = [];
  fixture.state.cookieValido = "1";
  fixture.state.reorderColumns = false;
  fixture.state.visitas = {
    login: 0,
    listaClientes: 0,
    consultarDeclaracao: 0,
    obterDocumento: 0,
    pdf: 0,
  };
});

describe("AcessoGovAtSessions.precondition", () => {
  it("recusa uma empresa sem NIF antes de abrir o browser", () => {
    const factory = new AcessoGovAtSessions({
      browser: { async newContext() {  throw new Error("não devia abrir"); }, async close() {} },
      state: new InMemoryStorageStateStore(),
    });
    expect(factory.precondition(empresa(null))).toEqual({
      ok: false,
      outcome: "company_nif_missing",
    });
    expect(factory.precondition(empresa())).toEqual({ ok: true });
    expect(factory.access).toBe("at_direct_login");
    expect(factory.credentialProvider).toBe("at");
  });
});

describe.skipIf(skip)("AcessoGovAtSessions (browser + Portal das Finanças local)", () => {
  it("autentica, seleciona o cliente e guarda o estado pela chave da equipa", async () => {
    const { factory, state } = sessions();

    const aberta = await abrir(factory);

    expect(aberta.reused).toBe(false);
    expect(aberta.session.access).toBe("at_direct_login");
    expect(aberta.session.host).toBe(new URL(fixture.baseUrl).host);
    expect(aberta.session.urls.consultarDeclaracao).toBe(
      `${fixture.baseUrl}/dpiva/portal/cc/consultar-declaracao`,
    );
    expect(fixture.state.visitas.listaClientes).toBe(1);

    const guardado = await state.load(`at:team:${EQUIPA}`);
    expect(guardado?.state.cookies?.some((c) => c.name === "sessao")).toBe(true);
    expect(guardado?.host).toBe(new URL(fixture.baseUrl).host);

    await aberta.session.close();
    expect(aberta.session.page.isClosed()).toBe(true);
  }, 30_000);

  it("credencial da empresa entra pelos caminhos diretos, sem escolher cliente", async () => {
    const { factory, state } = sessions();

    const aberta = await abrir(factory, { scope: ESCOPO_EMPRESA });

    expect(aberta.session.urls.obterDocumentoPagamento).toBe(
      `${fixture.baseUrl}/dpiva/portal/obter-doc-pagamento`,
    );
    expect(fixture.state.visitas.listaClientes).toBe(0);
    expect(await state.load(`at:company:emp-1`)).not.toBeNull();
    await aberta.session.close();
  }, 30_000);

  it("reutiliza a sessão guardada sem voltar a passar pelo login", async () => {
    const { factory } = sessions();
    const primeira = await abrir(factory);
    await primeira.session.close();

    fixture.state.visitas.login = 0;
    const segunda = await abrir(factory);

    expect(segunda.reused).toBe(true);
    expect(fixture.state.visitas.login).toBe(0);
    await segunda.session.close();
  }, 30_000);

  it("sessão expirada é descartada e o login refeito", async () => {
    const { factory, state } = sessions();
    const primeira = await abrir(factory);
    await primeira.session.close();

    // O portal passa a aceitar só um cookie novo: o guardado morreu.
    fixture.state.cookieValido = "2";
    fixture.state.visitas.login = 0;

    const segunda = await abrir(factory);

    expect(segunda.reused).toBe(false);
    expect(fixture.state.visitas.login).toBeGreaterThan(0);
    const guardado = await state.load(`at:team:${EQUIPA}`);
    expect(guardado?.state.cookies?.some((c) => c.value === "2")).toBe(true);
    await segunda.session.close();
  }, 30_000);

  it("estado com mais de 12 horas é descartado sem sequer ser tentado", async () => {
    const { factory, state } = sessions();
    const primeira = await abrir(factory);
    await primeira.session.close();

    const guardado = await state.load(`at:team:${EQUIPA}`);
    if (guardado === null) throw new Error("estado não guardado");
    await state.save(`at:team:${EQUIPA}`, {
      ...guardado,
      savedAt: new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString(),
    });
    fixture.state.visitas.login = 0;
    fixture.state.visitas.consultarDeclaracao = 0;

    const segunda = await abrir(factory);

    expect(segunda.reused).toBe(false);
    expect(fixture.state.visitas.login).toBe(1);
    await segunda.session.close();
  }, 30_000);

  it("senha recusada → AtAuthError(rejected) com as tentativas que faltam, sem expor a senha", async () => {
    const { factory, state } = sessions(new InMemoryStorageStateStore(), 4_000);

    const erro = await erroDe(abrir(factory, { password: SENHAS.errada }));

    expect(erro).toBeInstanceOf(AtAuthError);
    expect((erro as AtAuthError).reason).toBe("rejected");
    expect((erro as AtAuthError).attemptsLeft).toBe(2);
    const superficie = `${String(erro)}\n${erro?.stack ?? ""}`;
    expect(superficie).not.toContain(SENHAS.errada);
    expect(await state.load(`at:team:${EQUIPA}`)).toBeNull();
  }, 30_000);

  it("conta bloqueada → AtAuthError(blocked)", async () => {
    const { factory } = sessions(new InMemoryStorageStateStore(), 4_000);
    const erro = await erroDe(abrir(factory, { password: SENHAS.bloqueada }));
    expect(erro).toBeInstanceOf(AtAuthError);
    expect((erro as AtAuthError).reason).toBe("blocked");
  }, 30_000);

  it("desafio de segundo fator → AtAuthError(two_factor)", async () => {
    const { factory } = sessions(new InMemoryStorageStateStore(), 4_000);
    const erro = await erroDe(abrir(factory, { password: SENHAS.doisFatores }));
    expect(erro).toBeInstanceOf(AtAuthError);
    expect((erro as AtAuthError).reason).toBe("two_factor");
  }, 30_000);

  it("senha expirada → AtAuthError(expired)", async () => {
    const { factory } = sessions(new InMemoryStorageStateStore(), 4_000);
    const erro = await erroDe(abrir(factory, { password: SENHAS.expirada }));
    expect(erro).toBeInstanceOf(AtAuthError);
    expect((erro as AtAuthError).reason).toBe("expired");
  }, 30_000);

  it("formulário nu sem aviso → erro RETENTÁVEL, nunca uma recusa de credencial", async () => {
    const { factory } = sessions(new InMemoryStorageStateStore(), 4_000);

    const erro = await erroDe(abrir(factory, { password: SENHAS.avaria }));

    // Ler os rótulos do formulário como recusa marcaria a credencial e faria
    // TODOS os jobs seguintes morrerem na pré-condição.
    expect(erro).toBeInstanceOf(AtTransientError);
    expect((erro as AtTransientError).outcome).toBe("at_unavailable");
    expect(erro).not.toBeInstanceOf(StructuralError);
  }, 30_000);

  it("contabilista sem autorização para o contribuinte → AtAuthError(authorization_missing)", async () => {
    const { factory } = sessions();
    const erro = await erroDe(abrir(factory, { company: empresa(NIFS.semAutorizacao) }));
    expect(erro).toBeInstanceOf(AtAuthError);
    expect((erro as AtAuthError).reason).toBe("authorization_missing");
  }, 30_000);

  it("portal a mostrar outro contribuinte → at_session_mismatch, e a mensagem não leva NIFs", async () => {
    const { factory } = sessions();

    const erro = await erroDe(abrir(factory, { company: empresa(NIFS.trocado) }));

    expect(erro).toBeInstanceOf(AtIntegrityError);
    expect((erro as AtIntegrityError).outcome).toBe("at_session_mismatch");
    const superficie = `${erro?.message ?? ""}${JSON.stringify((erro as AtIntegrityError).fingerprint ?? {})}`;
    expect(superficie).not.toContain(NIFS.trocado);
    expect(superficie).not.toContain(NIFS.trocadoMostrado);
    expect(superficie).not.toMatch(/\d{9}/);
  }, 30_000);

  it("aterrar num host inesperado → AtIntegrityError(at_unexpected_page)", async () => {
    const state = new InMemoryStorageStateStore();
    const factory = new AcessoGovAtSessions(
      { browser: provider(), state },
      {
        loginUrl: `${fixture.loginBaseUrl}/loginForm`,
        loginHostPattern: padroesDeHost(fixture).loginHostPattern,
        portalHostPattern: /^nunca\.example$/,
        timeoutMs: 3_000,
      },
    );

    const erro = await erroDe(abrir(factory));

    expect(erro).toBeInstanceOf(AtIntegrityError);
    expect((erro as AtIntegrityError).outcome).toBe("at_unexpected_page");
    expect(await state.load(`at:team:${EQUIPA}`)).toBeNull();
  }, 30_000);

  it("a senha nunca entra numa URL pedida ao portal", async () => {
    const { factory } = sessions();
    const aberta = await abrir(factory);

    expect(pedidos.length).toBeGreaterThan(0);
    for (const url of pedidos) expect(url).not.toContain(SENHAS.boa);
    expect(aberta.session.page.url()).not.toContain(SENHAS.boa);
    await aberta.session.close();
  }, 30_000);

  it("uma falha a meio do open não deixa contextos abertos", async () => {
    // Os dois pontos onde se pode falhar com o browser já aberto: durante o
    // login e depois dele, a escolher o cliente. Um contexto esquecido por
    // empresa é um Chromium a mais por empresa num lote de 182.
    await erroDe(abrir(sessions().factory, { company: empresa(NIFS.semAutorizacao) }));
    await erroDe(
      abrir(sessions(new InMemoryStorageStateStore(), 4_000).factory, {
        password: SENHAS.errada,
      }),
    );

    expect(contextos.length).toBe(2);
    for (const contexto of contextos) expect(contexto.pages()).toHaveLength(0);
  }, 30_000);
});
