import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright";
import { readCompaniesGrid } from "../../src/toconline/companies-grid";
import { normalizeScan } from "@toc/core/domain";
import { StructuralError } from "../../src/errors";

// Browser real, mas ZERO rede externa: a fixture é servida em localhost. É este
// teste que prova a travessia de shadow DOM e a janela de estabilidade — as
// duas coisas que nenhum teste puro consegue cobrir.
const skip = process.env.SKIP_BROWSER_TESTS === "1";

const here = dirname(fileURLToPath(import.meta.url));
let browser: Browser;
let server: Server;
let baseUrl = "";

/** Serve a fixture, opcionalmente com um patch de JS injetado antes do </body>. */
function startServer(html: string): Promise<string> {
  return new Promise((resolve) => {
    server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve(`http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`);
    });
  });
}

let fixtureHtml = "";

beforeAll(async () => {
  if (skip) return;
  fixtureHtml = await readFile(join(here, "../fixtures/toconline-companies.html"), "utf8");
  browser = await chromium.launch({ headless: true });
  baseUrl = await startServer(fixtureHtml);
}, 60_000);

afterAll(async () => {
  await browser?.close();
  server?.close();
});

async function openPage(): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  return page;
}

describe.skipIf(skip)("readCompaniesGrid (browser + fixture local)", () => {
  it("atravessa três camadas de shadow DOM e lê as 200 empresas", async () => {
    const page = await openPage();
    const read = await readCompaniesGrid(page, { quietMs: 400, timeoutMs: 15_000 });

    expect(read.via).toBe("items");
    expect(read.rows).toHaveLength(200);
    expect(read.reportedSize).toBe(200);
    await page.context().close();
  }, 30_000);

  // O ponto central: a primeira tranche traz 60 e o `size` acompanha-a, portanto
  // a guarda de truncagem NÃO apanharia. Só a janela de estabilidade evita
  // persistir 60 de 200.
  it("nunca devolve a primeira tranche parcial", async () => {
    const page = await openPage();
    const read = await readCompaniesGrid(page, { quietMs: 400, timeoutMs: 15_000 });

    expect(read.rows.length).not.toBe(60);
    expect(read.rows).toHaveLength(200);
    await page.context().close();
  }, 30_000);

  it("apesar da virtualização — só 5 linhas existem no DOM", async () => {
    const page = await openPage();
    const read = await readCompaniesGrid(page, { quietMs: 400, timeoutMs: 15_000 });

    const linhasNoDom = await page.locator("vaadin-grid tr").count();
    expect(linhasNoDom).toBe(5);
    expect(read.rows.length).toBe(200);
    await page.context().close();
  }, 30_000);

  it("não traz _csHTML para fora do browser", async () => {
    const page = await openPage();
    const read = await readCompaniesGrid(page, { quietMs: 400, timeoutMs: 15_000 });

    expect(JSON.stringify(read)).not.toContain("_csHTML");
    expect(JSON.stringify(read)).not.toContain("<div");
    await page.context().close();
  }, 30_000);

  it("o que sai daqui alimenta a normalização do domínio", async () => {
    const page = await openPage();
    const read = await readCompaniesGrid(page, { quietMs: 400, timeoutMs: 15_000 });
    const scan = normalizeScan(read.rows);

    expect(scan.companies).toHaveLength(200);
    expect(scan.rejected).toHaveLength(0);
    // A fixture marca 1 em cada 50 como demo e 1 em cada 25 como inativa.
    expect(scan.companies.filter((c) => c.demo)).toHaveLength(4);
    expect(scan.companies.filter((c) => !c.active)).toHaveLength(8);
    await page.context().close();
  }, 30_000);

  it("página sem vaadin-grid → StructuralError", async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent("<html><body><p>sem grelha</p></body></html>");

    await expect(readCompaniesGrid(page, { timeoutMs: 1500 })).rejects.toThrow(StructuralError);
    await context.close();
  }, 30_000);

  // O pior desfecho do módulo é a lista truncada aceite em silêncio. Se o
  // stream nunca parar dentro do tempo, desistir e projetar o que está lá
  // persiste meia carteira como se fosse a carteira toda — e o `size` acompanha
  // os dados, portanto a guarda de truncagem não apanha. Tem de falhar alto.
  it("grid que nunca estabiliza → StructuralError, nunca uma lista parcial", async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(`
      <vaadin-grid id="g"></vaadin-grid>
      <script>
        const g = document.getElementById('g');
        g.items = [{ id: 1, tax_number: "501442600", name: "Empresa 1" }];
        g.size = 1;
        // Tranche nova a cada 100ms, para sempre: o total nunca repete.
        setInterval(() => {
          g.items = [...g.items, { id: g.items.length + 1, tax_number: "501442600", name: "Empresa" }];
          g.size = g.items.length;
        }, 100);
      </script>
    `);

    await expect(
      readCompaniesGrid(page, { timeoutMs: 2000, quietMs: 200 }),
    ).rejects.toThrow(StructuralError);
    await context.close();
  }, 30_000);

  it("grid presente mas que nunca enche → StructuralError", async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(`
      <vaadin-grid id="g"></vaadin-grid>
      <script>document.getElementById('g').items = [];</script>
    `);

    await expect(readCompaniesGrid(page, { timeoutMs: 1500 })).rejects.toThrow(StructuralError);
    await context.close();
  }, 30_000);
});
