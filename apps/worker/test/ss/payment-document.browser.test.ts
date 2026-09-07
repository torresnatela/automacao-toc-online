import { chromium, type Browser, type BrowserContext } from "playwright";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AtIntegrityError } from "../../src/errors";
import type { AtCompanyHandle, AuthenticatedAtSession } from "../../src/runner/ports";
import { SsPaymentDocumentFetcher } from "../../src/ss/payment-document";
import { PDF_DE_TESTE, SS_FIXTURE, startSsFixtureServer, type SsFixtureServer } from "./ss-fixture-server";

/**
 * O percurso da Segurança Social Direta de ponta a ponta contra a fixture
 * local: menus por texto, opção de representação, valor, Pagar, Multibanco e
 * o PDF a chegar como anexo. O que se prova aqui é o **contrato de texto** do
 * fetcher e os três desfechos (documento, nada a pagar, fluxo mudou).
 */
const skip = process.env.SKIP_BROWSER_TESTS === "1";

let ss: SsFixtureServer;
let browser: Browser;
let context: BrowserContext;

const EMPRESA: AtCompanyHandle = { id: "emp-1", nif: SS_FIXTURE.nif, tocCompanyId: 4321, tocCluster: 5 };

async function sessao(): Promise<AuthenticatedAtSession> {
  const page = await context.newPage();
  await page.goto(`${ss.baseUrl}/ptss/home`, { waitUntil: "domcontentloaded" });
  return {
    page,
    access: "toconline_direct_access",
    urls: { consultarDeclaracao: ss.baseUrl, obterDocumentoPagamento: ss.baseUrl },
    host: new URL(ss.baseUrl).host,
    close: async () => {
      await page.close();
    },
  };
}

function fetcher(): SsPaymentDocumentFetcher {
  return new SsPaymentDocumentFetcher({ portalOrigin: ss.baseUrl, timeoutMs: 8_000 });
}

beforeAll(async () => {
  if (skip) return;
  ss = await startSsFixtureServer();
  browser = await chromium.launch({ headless: true });
}, 60_000);

afterAll(async () => {
  await browser?.close();
  await ss?.close();
});

beforeEach(async () => {
  if (skip) return;
  ss.state.amountDue = SS_FIXTURE.valor;
  ss.state.menuPresent = true;
  ss.state.representationOption = true;
  ss.requests.length = 0;
  context = await browser.newContext({ acceptDownloads: true });
});

afterEach(async () => {
  await context?.close();
});

describe.skipIf(skip)("SsPaymentDocumentFetcher", () => {
  it("percorre os menus, marca «atuar em nome próprio», escolhe Multibanco e traz o PDF com os campos", async () => {
    const marcos: string[] = [];
    const log = {
      info: async (_m: string, d?: Record<string, unknown>) => {
        marcos.push(String(d?.step ?? ""));
      },
      warn: async () => {},
    };

    const resultado = await fetcher().fetch(await sessao(), { company: EMPRESA, log });

    expect(resultado.kind).toBe("document");
    if (resultado.kind !== "document") return;
    expect(resultado.pdf.equals(PDF_DE_TESTE)).toBe(true);
    expect(resultado.via).toBe("download");
    expect(resultado.fields).toEqual({
      amount: SS_FIXTURE.valor,
      entity: SS_FIXTURE.entidade,
      reference: SS_FIXTURE.referencia,
      source: "html",
    });
    // A opção de representação foi mesmo marcada antes de se ler o valor.
    expect(ss.requests).toContain("/ptss/fazer-pagamento?nomeProprio=1");
    expect(marcos).toEqual([
      "pagamentos_e_dividas",
      "valores_a_pagar",
      "pagamentos",
      "fazer_pagamento",
      "atuar_em_nome_proprio",
      "amount_read",
      "pagar",
      "multibanco",
      "confirmar",
      "pdf_captured",
    ]);
  }, 30_000);

  it("devolve «nada a pagar» como valor quando a empresa está em dia", async () => {
    ss.state.amountDue = null;

    const resultado = await fetcher().fetch(await sessao(), { company: EMPRESA });

    expect(resultado).toEqual({ kind: "nothing_to_pay" });
    expect(ss.requests.some((p) => p.startsWith("/ptss/pagar"))).toBe(false);
  }, 30_000);

  it("segue em frente quando a conta já atua em nome próprio (sem a opção)", async () => {
    ss.state.representationOption = false;

    const resultado = await fetcher().fetch(await sessao(), { company: EMPRESA });

    expect(resultado.kind).toBe("document");
  }, 30_000);

  it("falha alto, sem retentativa, quando um menu deixou de existir", async () => {
    ss.state.menuPresent = false;

    const erro = await fetcher()
      .fetch(await sessao(), { company: EMPRESA })
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(AtIntegrityError);
    expect((erro as AtIntegrityError).outcome).toBe("at_unexpected_page");
    expect((erro as AtIntegrityError).message).toContain("Pagamentos e Dívidas");
  }, 30_000);
});
