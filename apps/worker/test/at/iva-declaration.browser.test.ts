import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { chromium, type Browser } from "playwright";
import { AtIvaDeclarationReader } from "../../src/at/iva-declaration";
import { AcessoGovAtSessions } from "../../src/at/session-acesso-gov";
import { AtAuthError, AtIntegrityError } from "../../src/errors";
import { InMemoryStorageStateStore, type StorageState } from "../../src/toconline/storage-state";
import type { BrowserProvider } from "../../src/browser/browser";
import type { AtCompanyHandle, AuthenticatedAtSession } from "../../src/runner/ports";
import {
  NIFS,
  SENHAS,
  padroesDeHost,
  startAtFixtureServer,
  type AtFixtureServer,
} from "./fixture-server";

/**
 * A tabela de declarações lida de um DOM verdadeiro.
 *
 * O que só aqui se prova é o que a pureza de `parseDeclarationRows` não alcança:
 * que as células chegam ao parser na ordem em que o portal as escreveu, e que
 * baralhar as colunas do cabeçalho não muda o período escolhido.
 */
const skip = process.env.SKIP_BROWSER_TESTS === "1";

let browser: Browser;
let fixture: AtFixtureServer;
let sessoes: AuthenticatedAtSession[] = [];

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

function empresa(nif: string): AtCompanyHandle {
  return { id: "emp-1", nif, tocCompanyId: null, tocCluster: null };
}

/** Abre uma sessão de verdade contra o portal local — o reader só lê páginas. */
async function abrirSessao(nif: string): Promise<AuthenticatedAtSession> {
  const factory = new AcessoGovAtSessions(
    { browser: provider(), state: new InMemoryStorageStateStore() },
    {
      loginUrl: `${fixture.loginBaseUrl}/loginForm`,
      ...padroesDeHost(fixture),
      timeoutMs: 8_000,
    },
  );
  const aberta = await factory.open({
    company: empresa(nif),
    credentialId: "cred-at-1",
    credentials: { username: "123456789", password: SENHAS.boa },
    scope: { teamId: "equipa-1", companyId: null },
  });
  sessoes.push(aberta.session);
  return aberta.session;
}

function reader(): AtIvaDeclarationReader {
  return new AtIvaDeclarationReader({ ...padroesDeHost(fixture), timeoutMs: 8_000 });
}

/** A mesma sessão, apontada a outro URL — para os desfechos que não têm rota própria. */
function apontada(session: AuthenticatedAtSession, url: string): AuthenticatedAtSession {
  return {
    page: session.page,
    access: session.access,
    host: session.host,
    urls: { ...session.urls, consultarDeclaracao: url },
    close: () => session.close(),
  };
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
  sessoes = [];
  fixture.state.reorderColumns = false;
});

afterEach(async () => {
  for (const sessao of sessoes) await sessao.close().catch(() => undefined);
});

describe.skipIf(skip)("AtIvaDeclarationReader (browser + Portal das Finanças local)", () => {
  it("escolhe a substituição mais recente do período mais alto", async () => {
    const session = await abrirSessao(NIFS.bom);

    const lida = await reader().readMostRecent(session, empresa(NIFS.bom));

    expect(lida).toEqual({
      kind: "found",
      period: "2026-07",
      submittedAt: "2026-09-03",
      replacement: true,
      rowsSeen: 3,
    });
  }, 30_000);

  it("colunas reordenadas dão exatamente o mesmo resultado", async () => {
    fixture.state.reorderColumns = true;
    const session = await abrirSessao(NIFS.bom);

    const lida = await reader().readMostRecent(session, empresa(NIFS.bom));

    // Localizar as colunas pelo ÍNDICE leria a data como período e traria a
    // guia do mês errado. É esta a asserção que o impede.
    expect(lida).toEqual({
      kind: "found",
      period: "2026-07",
      submittedAt: "2026-09-03",
      replacement: true,
      rowsSeen: 3,
    });
  }, 30_000);

  it("cliente sem declarações → none, e não é falha", async () => {
    const session = await abrirSessao(NIFS.semDeclaracoes);

    const lida = await reader().readMostRecent(session, empresa(NIFS.semDeclaracoes));

    expect(lida).toEqual({ kind: "none", rowsSeen: 0 });
  }, 30_000);

  it("sem autorização no portal → AtAuthError(authorization_missing)", async () => {
    const session = await abrirSessao(NIFS.bom);
    const alvo = apontada(
      session,
      `${session.urls.consultarDeclaracao}?semAutorizacao=1`,
    );

    await expect(reader().readMostRecent(alvo, empresa(NIFS.bom))).rejects.toBeInstanceOf(
      AtAuthError,
    );
  }, 30_000);

  it("página irreconhecível → AtIntegrityError(at_unexpected_page) com fingerprint redigido", async () => {
    const session = await abrirSessao(NIFS.bom);
    const alvo = apontada(session, `${fixture.baseUrl}/pagina-que-nao-existe`);

    const erro = await reader()
      .readMostRecent(alvo, empresa(NIFS.bom))
      .then(() => null)
      .catch((e: unknown) => e as AtIntegrityError);

    expect(erro).toBeInstanceOf(AtIntegrityError);
    expect(erro?.outcome).toBe("at_unexpected_page");
    expect(JSON.stringify(erro?.fingerprint ?? {})).not.toMatch(/\d{9}/);
  }, 30_000);
});
