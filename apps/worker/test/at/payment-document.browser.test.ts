import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { chromium, type Browser } from "playwright";
import { AtPaymentDocumentFetcher } from "../../src/at/payment-document";
import { AT } from "../../src/at/selectors";
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
 * A captura da guia contra a **lista** de `obter-doc-pagamento` de um portal
 * local (filtro de ano + uma declaração por linha, como no reconhecimento de
 * 2026-09-07), que entrega o PDF de três maneiras.
 *
 * Duas asserções dão sentido ao ficheiro. A dos **mesmos bytes**: `attachment`,
 * `inline` e `popup` são três caminhos técnicos para o mesmo documento, e se
 * algum deles trouxesse um ficheiro diferente (o visor impresso, por exemplo)
 * ninguém daria por isso até um contribuinte tentar pagar com ele. E a da
 * **linha certa**: o portal só diz o mês/trimestre na linha e o ano no filtro,
 * portanto clicar a linha errada — ou o ano errado — entrega uma guia válida
 * do período errado, que é pior do que nenhuma.
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
  fixture.state.anoInicial = "2026";
  fixture.state.ultimoAno = null;
  fixture.state.ultimoDocumento = null;
  fixture.state.semBotao = false;
});

afterEach(async () => {
  for (const sessao of sessoes) await sessao.close().catch(() => undefined);
  for (const real of providersReais) await real.close().catch(() => undefined);
});

describe.skipIf(skip)("AtPaymentDocumentFetcher (browser + Portal das Finanças local)", () => {
  it("modo attachment: o download traz a guia da linha do período, sem campos do HTML", async () => {
    const session = await abrirSessao();

    const obtido = await fetcher().fetch(session, { period: "2026-07", company: empresa() });

    if (obtido.kind !== "document") throw new Error(`esperava documento, veio ${obtido.kind}`);
    expect(obtido.via).toBe("download");
    expect(obtido.pdf.equals(fixture.state.pdf)).toBe(true);
    // A lista não traz entidade/referência/valor — vivem no PDF. O desfecho é
    // `fetched_without_fields`, e o período é o pedido, para o ficheiro saber
    // sempre a que mês pertence.
    expect(obtido.fields).toEqual({
      period: "2026-07",
      entity: null,
      reference: null,
      amount: null,
      nif: null,
      source: "none",
    });
    expect(fixture.state.ultimoDocumento).toBe("07");
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
      () => pagina.locator(AT.paymentDocument.rows).first().locator(AT.paymentDocument.obtainInRow).click(),
      { timeoutMs: 6_000 },
    )
      .then(() => null)
      .catch((e: unknown) => e as AtTransientError);

    expect(erro).toBeInstanceOf(AtTransientError);
    expect(erro?.outcome).toBe("document_capture_failed");
    await contexto.close();
  }, 60_000);

  it("linha sem o link de obter documento → AtIntegrityError, não um timeout cru", async () => {
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

  it("muda o filtro de ano quando a lista abre noutro ano", async () => {
    fixture.state.anoInicial = "2025";
    const session = await abrirSessao();

    const obtido = await fetcher().fetch(session, { period: "2026-07", company: empresa() });

    expect(obtido.kind).toBe("document");
    expect(fixture.state.ultimoAno).toBe("2026");
    expect(fixture.state.ultimoDocumento).toBe("07");
  }, 40_000);

  it("não volta a pesquisar quando a lista já está no ano pedido", async () => {
    fixture.state.anoInicial = "2026";
    const session = await abrirSessao();

    const obtido = await fetcher().fetch(session, { period: "2026-07", company: empresa() });

    expect(obtido.kind).toBe("document");
    expect(fixture.state.ultimoAno).toBeNull();
  }, 40_000);

  it("o trimestre pedido clica a linha do trimestre, não a de um mês", async () => {
    const session = await abrirSessao();

    const obtido = await fetcher().fetch(session, { period: "2026-Q3", company: empresa() });

    expect(obtido.kind).toBe("document");
    expect(fixture.state.ultimoDocumento).toBe("3T");
  }, 40_000);

  it("ano pedido sem opção no filtro → no_document, sem ler as linhas do outro ano", async () => {
    // Se o filtro não tem 2024, as linhas no ecrã são de 2026. Ler a linha
    // «07» como 2024-07 e clicá-la entregava a guia certa do ano errado.
    fixture.state.anoInicial = "2026";
    const session = await abrirSessao();

    const obtido = await fetcher().fetch(session, { period: "2024-07", company: empresa() });

    expect(obtido).toEqual({ kind: "no_document" });
    expect(fixture.state.ultimoDocumento).toBeNull();
  }, 40_000);

  it("tabela vazia → no_document (não é falha)", async () => {
    fixture.state.mode = "none";
    const session = await abrirSessao();
    const obtido = await fetcher().fetch(session, { period: "2026-07", company: empresa() });
    expect(obtido).toEqual({ kind: "no_document" });
  }, 40_000);

  it("lista sem a linha do período pedido → not_ready", async () => {
    fixture.state.mode = "notready";
    const session = await abrirSessao();
    const obtido = await fetcher().fetch(session, { period: "2026-07", company: empresa() });
    expect(obtido).toEqual({ kind: "not_ready" });
    expect(fixture.state.ultimoDocumento).toBeNull();
  }, 40_000);

  it("página sem tabela mas com o aviso de já pago → already_paid (pela redação)", async () => {
    fixture.state.mode = "paid";
    const session = await abrirSessao();
    const obtido = await fetcher().fetch(session, { period: "2026-07", company: empresa() });
    expect(obtido).toEqual({ kind: "already_paid" });
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

  it("página irreconhecível (sem tabela nem aviso) → AtIntegrityError(at_unexpected_page)", async () => {
    // Um portal redesenhado sem a tabela não pode passar por «não há guia».
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
/**
 * A guarda do shim do `__name`.
 *
 * O `tsx` (esbuild) compila com `keepNames` e embrulha cada função nomeada em
 * `__name(fn, "nome")`. O Playwright envia para o browser o CÓDIGO-FONTE da
 * função dada a `page.evaluate`, e leva o `__name` com ela — que do lado de lá
 * não existe. Sem o shim, todo o `page.evaluate` deste worker rebenta sob
 * `tsx`, incluindo o `snapshotPage` de que a classificação de páginas da AT
 * depende; e nada disso é visível a partir do Vitest, que não injeta o helper.
 *
 * Daí o teste ser sobre o **contrato** e não sobre o sintoma: afirma que
 * `globalThis.__name` existe em qualquer página que o `PlaywrightBrowser`
 * abra. Essa afirmação falha assim que alguém tirar o shim, corra o teste sob
 * o que correr.
 */
describe.skipIf(skip)("PlaywrightBrowser — shim do __name", () => {
  async function paginaNova() {
    const real = new PlaywrightBrowser({ headless: true });
    providersReais.push(real);
    const contexto = await real.newContext();
    const pagina = await contexto.newPage();
    await pagina.goto("about:blank");
    return pagina;
  }

  it("define globalThis.__name em qualquer página que abra", async () => {
    const pagina = await paginaNova();

    // Avaliado como STRING de propósito: uma função aqui seria transformada
    // pelo mesmo compilador que causa o problema, e o teste passaria a provar
    // o remédio em vez do contrato.
    expect(await pagina.evaluate("typeof globalThis.__name")).toBe("function");
  }, 30_000);

  it("uma função nomeada dentro do evaluate sobrevive à serialização", async () => {
    const pagina = await paginaNova();

    // É esta a forma que rebenta sem o shim: o `const identidade = …` sai
    // embrulhado em `__name(...)` quando compilado pelo `tsx`.
    const resultado = await pagina.evaluate(() => {
      const identidade = (x: number) => x;
      return identidade(1);
    });

    expect(resultado).toBe(1);
  }, 30_000);
});
