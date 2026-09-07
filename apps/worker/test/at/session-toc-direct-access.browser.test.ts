import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PersistentChromiumBrowser } from "../../src/browser/persistent-chromium";
import { TocDirectAccessAtSessions } from "../../src/at/session-toc-direct-access";
import {
  AtAuthError,
  AtIntegrityError,
  AtTransientError,
  InvalidCredentialsError,
} from "../../src/errors";
import type { AtCompanyHandle, CredentialScope } from "../../src/runner/ports";
import {
  NIFS,
  SENHAS,
  padroesDeHost,
  startAtFixtureServer,
  type AtFixtureServer,
} from "./fixture-server";
import { TOC_FIXTURE, startTocFixtureServer, type TocFixtureServer } from "./toc-fixture-server";

/**
 * A rota A de ponta a ponta contra fixtures locais: Chromium persistente com a
 * extensão-fixture, TOConline de mentira em Shadow DOM, Portal das Finanças de
 * mentira em dois hosts. O que só aqui se prova: que o separador aberto pela
 * extensão chega ao adaptador como `page` do mesmo contexto, que o login feito
 * pela extensão é classificado como o da rota B, e que o `close()` limpa a AT
 * sem deitar abaixo a sessão do TOConline.
 */
const skip = process.env.SKIP_BROWSER_TESTS === "1";
const EXTENSAO = fileURLToPath(new URL("../fixtures/connect-extension", import.meta.url));
const EQUIPA = "equipa-1";
const ESCOPO: CredentialScope = { teamId: EQUIPA, companyId: null };

let at: AtFixtureServer;
let toc: TocFixtureServer;
let perfil: string;
let browser: PersistentChromiumBrowser | null = null;
/** Todas as URLs pedidas pelo browser, para provar que senha nenhuma vai numa. */
let pedidos: string[] = [];

function empresa(over: Partial<AtCompanyHandle> = {}): AtCompanyHandle {
  return { id: "emp-1", nif: NIFS.bom, tocCompanyId: 4321, tocCluster: 5, ...over };
}

function novoBrowser(extensionDir: string | null = EXTENSAO): PersistentChromiumBrowser {
  browser = new PersistentChromiumBrowser({
    userDataDir: join(perfil, "profile"),
    extensionDir,
    headless: true,
  });
  return browser;
}

/**
 * O TOConline de mentira responde em `localhost` e a AT em `127.0.0.1`: hosts
 * de cookie diferentes, como na realidade (`*.toconline.pt` vs `*.gov.pt`) —
 * é o que permite provar que o `close()` limpa a AT e poupa o TOConline.
 */
function tocUrl(): string {
  return toc.baseUrl.replace("127.0.0.1", "localhost");
}

function sessions(persistent: PersistentChromiumBrowser, timeoutMs = 8_000) {
  return new TocDirectAccessAtSessions(
    { persistent },
    {
      toconline: {
        loginUrl: `${tocUrl()}/login`,
        hostPattern: /^localhost(:\d+)?$/,
        timeoutMs,
      },
      at: { portalOrigin: at.baseUrl, ...padroesDeHost(at), timeoutMs },
      directAccessTimeoutMs: 4_000,
      appReadyTimeoutMs: 10_000,
      atCookieDomainPattern: /^127\.0\.0\.1$/,
    },
  );
}

function abrir(
  factory: TocDirectAccessAtSessions,
  opts: { company?: AtCompanyHandle; password?: string } = {},
) {
  return factory.open({
    company: opts.company ?? empresa(),
    credentialId: "cred-toc-1",
    credentials: { username: TOC_FIXTURE.utilizador, password: opts.password ?? TOC_FIXTURE.senha },
    scope: ESCOPO,
  });
}

beforeAll(async () => {
  if (skip) return;
  at = await startAtFixtureServer();
  toc = await startTocFixtureServer(at);
}, 60_000);

afterAll(async () => {
  await toc?.close();
  await at?.close();
});

beforeEach(async () => {
  perfil = await mkdtemp(join(tmpdir(), "toc-rota-a-"));
  pedidos = [];
  if (toc) {
    toc.state.activeCompany = null;
    toc.state.switches = [];
    toc.state.extensionMissing = false;
    toc.state.passwordConfigured = true;
    toc.state.atUsername = NIFS.bom;
    toc.state.atPassword = SENHAS.boa;
    toc.state.closeTabAfterLogin = false;
    toc.state.noTab = false;
    toc.state.sessionDelayMs = 300;
    toc.state.staysValidatingFor = 0;
    toc.state.stuckThisLoad = false;
    toc.state.visitas = { login: 0, vaultActions: 0 };
  }
  if (at) {
    at.state.serverError = false;
    at.state.visitas = { login: 0, listaClientes: 0, consultarDeclaracao: 0, obterDocumento: 0, pdf: 0 };
  }
});

afterEach(async () => {
  await browser?.close();
  browser = null;
  await rm(perfil, { recursive: true, force: true });
});

describe.skipIf(skip)("TocDirectAccessAtSessions (browser + TOConline e AT locais)", () => {
  it("abre a sessão da AT pela extensão: separador novo, host do portal, rota e caminhos diretos", async () => {
    const persistent = novoBrowser();
    const context = await persistent.context();
    context.on("request", (req) => pedidos.push(req.url()));
    const factory = sessions(persistent);

    const opened = await abrir(factory);

    expect(opened.reused).toBe(false);
    expect(opened.session.access).toBe("toconline_direct_access");
    expect(opened.session.host).toBe(new URL(at.baseUrl).host);
    expect(opened.session.urls).toEqual({
      consultarDeclaracao: `${at.baseUrl}/dpiva/portal/consultar-declaracao`,
      obterDocumentoPagamento: `${at.baseUrl}/dpiva/portal/obter-doc-pagamento`,
    });
    // A página devolvida é a da AT (aberta pela extensão), não a do TOConline.
    expect(new URL(opened.session.page.url()).host).toBe(new URL(at.baseUrl).host);
    // Vestiu a empresa pela app e aterrou logo no Acesso Direto.
    expect(toc.state.switches).toEqual([{ id: 4321, url: "/vault-actions" }]);
    // A extensão entrou e aterrou no portal exatamente uma vez.
    expect(at.state.visitas.consultarDeclaracao).toBe(1);

    await opened.session.close();

    // O close() fecha só a AT: o separador do TOConline fica para a empresa seguinte…
    const abertas = context.pages().map((p) => new URL(p.url()).host);
    expect(abertas).not.toContain(new URL(at.baseUrl).host);
    expect(abertas).toContain(new URL(tocUrl()).host);
    // …e as cookies da AT desaparecem, as do TOConline não.
    const daAt = await context.cookies([at.baseUrl, at.loginBaseUrl]);
    expect(daAt.some((c) => c.name === "sessao")).toBe(false);
    const doToc = await context.cookies([tocUrl()]);
    expect(doToc.some((c) => c.name === "toc_sessao")).toBe(true);
    // Nenhuma senha viajou em URL nenhuma.
    for (const url of pedidos) {
      expect(url).not.toContain(TOC_FIXTURE.senha);
      expect(url).not.toContain(SENHAS.boa);
    }
  }, 60_000);

  it("reutiliza a sessão do TOConline na empresa seguinte (um login por lote) e troca de empresa", async () => {
    const factory = sessions(novoBrowser());

    const primeira = await abrir(factory);
    await primeira.session.close();
    const segunda = await abrir(factory, { company: empresa({ id: "emp-2", tocCompanyId: 9999, tocCluster: 7 }) });
    await segunda.session.close();

    expect(primeira.reused).toBe(false);
    expect(segunda.reused).toBe(true);
    expect(toc.state.visitas.login).toBe(1);
    expect(toc.state.switches).toEqual([
      { id: 4321, url: "/vault-actions" },
      { id: 9999, url: "/vault-actions" },
    ]);
    expect(at.state.visitas.consultarDeclaracao).toBe(2);
  }, 90_000);

  it("uma validação de sessão presa é cortada por um reload, sem queimar a tentativa", async () => {
    // O primeiro carregamento fica preso na «Validação de sessão em curso»; o
    // adaptador, em vez de desistir (e disparar toconline_unavailable + a trava
    // do portal), recarrega uma vez e a app recomeça limpa.
    toc.state.staysValidatingFor = 1;
    const factory = sessions(novoBrowser(), 6_000);

    const opened = await abrir(factory);

    expect(opened.session.access).toBe("toconline_direct_access");
    expect(opened.session.host).toBe(new URL(at.baseUrl).host);
    await opened.session.close();
  }, 60_000);

  it("sem tocCompanyId a pré-condição é company_not_linked, sem abrir browser", () => {
    const factory = sessions(novoBrowser());
    expect(factory.precondition(empresa({ tocCompanyId: null }))).toEqual({
      ok: false,
      outcome: "company_not_linked",
    });
    // O cluster é um detalhe da varredura: a troca de empresa na app só precisa do id.
    expect(factory.precondition(empresa({ tocCluster: null }))).toEqual({ ok: true });
    expect(factory.precondition(empresa())).toEqual({ ok: true });
    expect(factory.access).toBe("toconline_direct_access");
    expect(factory.credentialProvider).toBe("toconline");
  });

  it("browser sem extensão → direct_access_extension_missing antes de tocar no TOConline", async () => {
    const factory = sessions(novoBrowser(null));

    const erro = await abrir(factory).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(AtIntegrityError);
    expect((erro as AtIntegrityError).outcome).toBe("direct_access_extension_missing");
    expect(toc.state.visitas.login).toBe(0);
  }, 60_000);

  it("o TOConline diz «Instalar Extensão Chrome» → direct_access_extension_missing", async () => {
    toc.state.extensionMissing = true;
    const factory = sessions(novoBrowser());

    const erro = await abrir(factory).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(AtIntegrityError);
    expect((erro as AtIntegrityError).outcome).toBe("direct_access_extension_missing");
  }, 60_000);

  it("senha da AT por gravar no TOConline → direct_access_not_configured", async () => {
    toc.state.passwordConfigured = false;
    const factory = sessions(novoBrowser());

    const erro = await abrir(factory).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(AtIntegrityError);
    expect((erro as AtIntegrityError).outcome).toBe("direct_access_not_configured");
    expect(at.state.visitas.login).toBe(0);
  }, 60_000);

  it("a AT recusa a senha que a extensão escreveu → AtAuthError(rejected) com as tentativas", async () => {
    toc.state.atPassword = SENHAS.errada;
    const persistent = novoBrowser();
    const factory = sessions(persistent);

    const erro = await abrir(factory).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(AtAuthError);
    expect((erro as AtAuthError).reason).toBe("rejected");
    expect((erro as AtAuthError).attemptsLeft).toBe(2);
    // Falhou a meio: o separador da AT não pode ficar aberto para a empresa seguinte.
    const abertas = (await persistent.context()).pages().map((p) => new URL(p.url()).host);
    expect(abertas).not.toContain(new URL(at.loginBaseUrl).host);
  }, 60_000);

  it("a AT pede o código por SMS → AtAuthError(two_factor)", async () => {
    toc.state.atPassword = SENHAS.doisFatores;
    const factory = sessions(novoBrowser());

    const erro = await abrir(factory).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(AtAuthError);
    expect((erro as AtAuthError).reason).toBe("two_factor");
  }, 60_000);

  it("a extensão fecha o separador antes de aterrar → direct_access_failed (retentável)", async () => {
    toc.state.closeTabAfterLogin = true;
    at.state.serverError = true;
    const factory = sessions(novoBrowser());

    const erro = await abrir(factory).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(AtTransientError);
    expect((erro as AtTransientError).outcome).toBe("direct_access_failed");
  }, 60_000);

  it("nenhum separador abre → direct_access_failed (retentável)", async () => {
    toc.state.noTab = true;
    const factory = sessions(novoBrowser());

    const erro = await abrir(factory).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(AtTransientError);
    expect((erro as AtTransientError).outcome).toBe("direct_access_failed");
  }, 60_000);

  it("a sessão aberta é de OUTRO contribuinte → at_session_mismatch, e a AT é limpa", async () => {
    const persistent = novoBrowser();
    const factory = sessions(persistent);

    const erro = await abrir(factory, { company: empresa({ nif: NIFS.trocadoMostrado }) }).catch(
      (e: unknown) => e,
    );

    expect(erro).toBeInstanceOf(AtIntegrityError);
    expect((erro as AtIntegrityError).outcome).toBe("at_session_mismatch");
    const context = await persistent.context();
    const cookies = await context.cookies([at.baseUrl]);
    expect(cookies.some((c) => c.name === "sessao")).toBe(false);
  }, 60_000);

  it("o TOConline recusa as credenciais do gabinete → InvalidCredentialsError", async () => {
    const factory = sessions(novoBrowser());

    const erro = await abrir(factory, { password: "errada-de-proposito" }).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(InvalidCredentialsError);
    expect((erro as Error).message).not.toContain("errada-de-proposito");
  }, 60_000);
});
