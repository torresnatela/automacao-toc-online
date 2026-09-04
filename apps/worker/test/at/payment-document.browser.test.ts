import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { chromium, type Browser } from "playwright";
import { AtPaymentDocumentFetcher } from "../../src/at/payment-document";
import { AcessoGovAtSessions } from "../../src/at/session-acesso-gov";
import { PlaywrightBrowser, type BrowserProvider } from "../../src/browser/browser";
import { capturePdf } from "../../src/at/pdf-capture";
import { AtAuthError, AtIntegrityError, AtTransientError } from "../../src/errors";
import { InMemoryStorageStateStore, type StorageState } from "../../src/toconline/storage-state";
import type { AtCompanyHandle, AuthenticatedAtSession } from "../../src/runner/ports";
import {
  NIFS,
  SENHAS,
  gerarPdfSintetico,
  padroesDeHost,
  startAtFixtureServer,
  type AtFixtureServer,
} from "./fixture-server";

/**
 * A captura da guia contra um portal que entrega o PDF de três maneiras.
 *
 * A asserção que dá sentido ao ficheiro é a dos **mesmos bytes**: `attachment`,
 * `inline` e `popup` são três caminhos técnicos para o mesmo documento, e se
 * algum deles trouxesse um ficheiro diferente (o visor impresso, por exemplo)
 * ninguém daria por isso até um contribuinte tentar pagar com ele.
 */
const skip = process.env.SKIP_BROWSER_TESTS === "1";

let browser: Browser;
let fixture: AtFixtureServer;
let sessoes: AuthenticatedAtSession[] = [];
let providersReais: PlaywrightBrowser[] = [];

function empresa(): AtCompanyHandle {
  return { id: "emp-1", nif: NIFS.bom, tocCompanyId: null, tocCluster: null };
}

function provider(): BrowserProvider {
  return {
    async newContext(options: { storageState?: StorageState; acceptDownloads?: boolean } = {}) {
      return browser.newContext({
        storageState: options.storageState,
        acceptDownloads: options.acceptDownloads,
      });
    },
    async close() {},
  };
}

async function abrirSessao(usarClasseReal = false): Promise<AuthenticatedAtSession> {
  let browserProvider: BrowserProvider;
  if (usarClasseReal) {
    // A classe de produção, para provar que é ELA que passa `acceptDownloads`.
    const real = new PlaywrightBrowser({ headless: true });
    providersReais.push(real);
    browserProvider = real;
  } else {
    browserProvider = provider();
  }
  const factory = new AcessoGovAtSessions(
    { browser: browserProvider, state: new InMemoryStorageStateStore() },
    { loginUrl: `${fixture.loginBaseUrl}/loginForm`, ...padroesDeHost(fixture), timeoutMs: 8_000 },
  );
  const aberta = await factory.open({
    company: empresa(),
    credentialId: "cred-at-1",
    credentials: { username: "123456789", password: SENHAS.boa },
    scope: { teamId: "equipa-1", companyId: null },
  });
  sessoes.push(aberta.session);
  return aberta.session;
}

function fetcher(): AtPaymentDocumentFetcher {
  return new AtPaymentDocumentFetcher({ ...padroesDeHost(fixture), timeoutMs: 8_000 });
}

/** A mesma sessão, apontada a outro URL — para os desfechos sem rota própria. */
function apontada(session: AuthenticatedAtSession, url: string): AuthenticatedAtSession {
  return {
    page: session.page,
    access: session.access,
    host: session.host,
    urls: { ...session.urls, obterDocumentoPagamento: url },
    close: () => session.close(),
  };
}

beforeAll(async () => {
  if (skip) return;
  browser = await chromium.launch({ headless: true });
  fixture = await startAtFixtureServer();

  // O PDF nasce aqui, do próprio Chromium: nada binário entra no repositório.
  const contexto = await browser.newContext();
  const pagina = await contexto.newPage();
  fixture.state.pdf = await gerarPdfSintetico(pagina);
  await contexto.close();
  if (fixture.state.pdf.length < 1000) throw new Error("PDF de fixture demasiado pequeno");
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await fixture?.close();
});

beforeEach(() => {
  if (skip) return;
  sessoes = [];
  providersReais = [];
  fixture.state.mode = "attachment";
  fixture.state.periodForm = false;
  fixture.state.ultimoPeriodo = null;
  fixture.state.semCampos = false;
  fixture.state.semBotao = false;
});

afterEach(async () => {
  for (const sessao of sessoes) await sessao.close().catch(() => undefined);
  for (const real of providersReais) await real.close().catch(() => undefined);
});

describe.skipIf(skip)("AtPaymentDocumentFetcher (browser + Portal das Finanças local)", () => {
  it("modo attachment: o download traz a guia, com os campos lidos do HTML", async () => {
    const session = await abrirSessao();

    const obtido = await fetcher().fetch(session, { period: "2026-07", company: empresa() });

    if (obtido.kind !== "document") throw new Error(`esperava documento, veio ${obtido.kind}`);
    expect(obtido.via).toBe("download");
    expect(obtido.pdf.equals(fixture.state.pdf)).toBe(true);
    expect(obtido.fields).toEqual({
      period: "2026/07",
      entity: "11111",
      reference: "123 456 789 012 345",
      amount: "1.234,56",
      nif: NIFS.bom,
      source: "html",
    });
  }, 40_000);

  it("modo inline: o PDF vem no corpo da própria resposta", async () => {
    fixture.state.mode = "inline";
    const session = await abrirSessao();

    const obtido = await fetcher().fetch(session, { period: "2026-07", company: empresa() });

    if (obtido.kind !== "document") throw new Error(`esperava documento, veio ${obtido.kind}`);
    expect(obtido.via).toBe("inline");
    expect(obtido.pdf.equals(fixture.state.pdf)).toBe(true);
  }, 40_000);

  it("modo popup: o PDF vem da janela nova, pelo contexto autenticado", async () => {
    fixture.state.mode = "popup";
    const session = await abrirSessao();

    const obtido = await fetcher().fetch(session, { period: "2026-07", company: empresa() });

    if (obtido.kind !== "document") throw new Error(`esperava documento, veio ${obtido.kind}`);
    expect(obtido.via).toBe("popup");
    expect(obtido.pdf.equals(fixture.state.pdf)).toBe(true);
    // A janela perdida não pode ficar aberta a segurar memória do Chromium.
    expect(session.page.context().pages()).toHaveLength(1);
  }, 40_000);

  it("as três entregas devolvem exatamente os mesmos bytes", async () => {
    const bytes: Buffer[] = [];
    for (const modo of ["attachment", "inline", "popup"] as const) {
      fixture.state.mode = modo;
      const session = await abrirSessao();
      const obtido = await fetcher().fetch(session, { period: "2026-07", company: empresa() });
      if (obtido.kind !== "document") throw new Error(`esperava documento, veio ${obtido.kind}`);
      bytes.push(obtido.pdf);
      await session.close();
    }
    expect(bytes[0]?.equals(bytes[1] ?? Buffer.alloc(0))).toBe(true);
    expect(bytes[1]?.equals(bytes[2] ?? Buffer.alloc(0))).toBe(true);
  }, 60_000);

  it("a classe real PlaywrightBrowser traz a guia de ponta a ponta", async () => {
    const session = await abrirSessao(true);

    const obtido = await fetcher().fetch(session, { period: "2026-07", company: empresa() });

    if (obtido.kind !== "document") throw new Error(`esperava documento, veio ${obtido.kind}`);
    expect(obtido.via).toBe("download");
    expect(obtido.pdf.equals(fixture.state.pdf)).toBe(true);
  }, 60_000);

  it("PlaywrightBrowser repassa acceptDownloads: a false, o ficheiro é cancelado", async () => {
    // O controlo NEGATIVO do wiring. O Playwright aceita downloads por omissão,
    // portanto um teste que só descarregue prova pouco; o que prova é que a
    // opção **chega** ao contexto — e o único sítio onde isso se vê de fora é
    // no que acontece quando ela vem a `false`.
    const real = new PlaywrightBrowser({ headless: true });
    providersReais.push(real);
    const contexto = await real.newContext({ acceptDownloads: false });
    await contexto.addCookies([{ name: "sessao", value: "1", url: fixture.baseUrl }]);
    const pagina = await contexto.newPage();
    await pagina.goto(`${fixture.baseUrl}/dpiva/portal/cc/obter-doc-pagamento`);

    const erro = await capturePdf(
      pagina,
      () => pagina.click('button:has-text("Obter documento de pagamento")'),
      { timeoutMs: 6_000 },
    )
      .then(() => null)
      .catch((e: unknown) => e as AtTransientError);

    expect(erro).toBeInstanceOf(AtTransientError);
    expect(erro?.outcome).toBe("document_capture_failed");
    await contexto.close();
  }, 60_000);

  it("layout sem o contentor dos campos: guia guardada, campos por ler", async () => {
    fixture.state.semCampos = true;
    const session = await abrirSessao();

    const obtido = await fetcher().fetch(session, { period: "2026-07", company: empresa() });

    // Recusar uma guia boa por causa de um `<main>` renomeado deixaria o IVA
    // por pagar. O desfecho é `fetched_without_fields`, não falha.
    if (obtido.kind !== "document") throw new Error(`esperava documento, veio ${obtido.kind}`);
    expect(obtido.fields.source).toBe("none");
    expect(obtido.fields.entity).toBeNull();
    // O período pedido é a rede de segurança: o ficheiro sabe sempre a que mês
    // pertence, mesmo quando o portal não o disse.
    expect(obtido.fields.period).toBe("2026-07");
    expect(obtido.pdf.equals(fixture.state.pdf)).toBe(true);
  }, 40_000);

  it("botão de obter documento em falta → AtIntegrityError, não um timeout cru", async () => {
    fixture.state.semBotao = true;
    const session = await abrirSessao();

    const erro = await fetcher()
      .fetch(session, { period: "2026-07", company: empresa() })
      .then(() => null)
      .catch((e: unknown) => e as AtIntegrityError);

    // Um `TimeoutError` do Playwright seria retentável, sem código de desfecho
    // e sem assinatura da página: três martelos no portal e nenhuma pista.
    expect(erro).toBeInstanceOf(AtIntegrityError);
    expect(erro?.outcome).toBe("at_unexpected_page");
    expect(erro?.fingerprint).toBeDefined();
  }, 40_000);

  it("preenche ano e período quando o portal os pede antes de mostrar a guia", async () => {
    fixture.state.periodForm = true;
    const session = await abrirSessao();

    const obtido = await fetcher().fetch(session, { period: "2026-07", company: empresa() });

    expect(obtido.kind).toBe("document");
    expect(fixture.state.ultimoPeriodo).toEqual({ ano: "2026", periodo: "07" });
  }, 40_000);

  it("o trimestre vai como número, não como o marcador canónico", async () => {
    fixture.state.periodForm = true;
    const session = await abrirSessao();

    await fetcher().fetch(session, { period: "2026-Q3", company: empresa() });

    expect(fixture.state.ultimoPeriodo).toEqual({ ano: "2026", periodo: "3" });
  }, 40_000);

  it("sem documento para o período → no_document (não é falha)", async () => {
    fixture.state.mode = "none";
    const session = await abrirSessao();
    const obtido = await fetcher().fetch(session, { period: "2026-07", company: empresa() });
    expect(obtido).toEqual({ kind: "no_document" });
  }, 40_000);

  it("imposto já pago → already_paid", async () => {
    fixture.state.mode = "paid";
    const session = await abrirSessao();
    const obtido = await fetcher().fetch(session, { period: "2026-07", company: empresa() });
    expect(obtido).toEqual({ kind: "already_paid" });
  }, 40_000);

  it("guia ainda em processamento → not_ready", async () => {
    fixture.state.mode = "notready";
    const session = await abrirSessao();
    const obtido = await fetcher().fetch(session, { period: "2026-07", company: empresa() });
    expect(obtido).toEqual({ kind: "not_ready" });
  }, 40_000);

  it("sem autorização no portal → AtAuthError(authorization_missing)", async () => {
    const session = await abrirSessao();
    const alvo = apontada(session, `${session.urls.obterDocumentoPagamento}?semAutorizacao=1`);

    const erro = await fetcher()
      .fetch(alvo, { period: "2026-07", company: empresa() })
      .then(() => null)
      .catch((e: unknown) => e as AtAuthError);

    expect(erro).toBeInstanceOf(AtAuthError);
    expect(erro?.reason).toBe("authorization_missing");
  }, 40_000);

  it("página irreconhecível → AtIntegrityError(at_unexpected_page)", async () => {
    const session = await abrirSessao();
    const alvo = apontada(session, `${fixture.baseUrl}/pagina-que-nao-existe`);

    const erro = await fetcher()
      .fetch(alvo, { period: "2026-07", company: empresa() })
      .then(() => null)
      .catch((e: unknown) => e as AtIntegrityError);

    expect(erro).toBeInstanceOf(AtIntegrityError);
    expect(erro?.outcome).toBe("at_unexpected_page");
  }, 40_000);
});
