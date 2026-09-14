import type { Locator, Page } from "playwright";
import { AtAuthError, AtIntegrityError } from "../errors";
import type {
  AtCompanyHandle,
  AuthenticatedAtSession,
  PaymentDocumentFetch,
  PaymentDocumentFetcher,
} from "../runner/ports";
import { classifyAtPage, fingerprint, snapshotPage, type AtPageSnapshot } from "./classify-page";
import { assertPdfIntegrity } from "./guards";
import { parsePaymentRows, pickMostRecentPayment } from "./parse-payment-list";
import { capturePdf } from "./pdf-capture";
import { AT, type AtOptions } from "./selectors";

/**
 * A guia de pagamento a partir da **lista** de `obter-doc-pagamento`.
 *
 * O portal real (reconhecimento de 2026-09-07) não abre um documento único:
 * lista uma declaração por linha — «Identificação | Período | Data de receção»
 * — e cada linha tem um «Obter documento de pagamento» que entrega o PDF. O
 * ano é um filtro; o período da linha traz só o trimestre.
 *
 * A ordem é a política:
 * - **Filtrar pelo ano** do período pedido antes de ler a tabela. Se o filtro
 *   não tem esse ano, as linhas no ecrã são de OUTRO ano — não se leem: lê-las
 *   com o ano pedido clicava a guia certa do ano errado. Não há guia.
 * - **Sem tabela, cai-se na redação**: «não existe documento», «já pago»,
 *   «em processamento» são estados normais do mês. O que não é nenhum deles
 *   nem é a lista é página que não se conhece, e falha alto com assinatura —
 *   um portal redesenhado não pode passar por «não há guia» em todas as
 *   empresas.
 * - **Encontrar a linha do período** pedido. Tabela vazia → não há guia;
 *   com linhas mas sem a do período → a declaração existe e o documento ainda
 *   não foi emitido (`not_ready`).
 * - **Clicar na linha certa** e correr as três estratégias de captura.
 * - **Verificar o PDF** antes de o devolver: um download cortado ou uma página
 *   de erro com `Content-Type: application/pdf` chegariam ao Storage com nome
 *   de guia.
 *
 * Os campos (entidade/referência/valor) **não vêm no HTML** desta lista — vivem
 * dentro do PDF. Por isso o desfecho é `fetched_without_fields` (`source:
 * "none"`): a guia fica guardada e útil, e a leitura dos campos do PDF é uma
 * melhoria posterior, não um bloqueio.
 */
export class AtPaymentDocumentFetcher implements PaymentDocumentFetcher {
  constructor(private readonly options: AtOptions = {}) {}

  private get timeout(): number {
    return this.options.timeoutMs ?? AT.defaultTimeoutMs;
  }

  private get padroes(): { loginHostPattern: RegExp; portalHostPattern: RegExp } {
    return {
      loginHostPattern: this.options.loginHostPattern ?? AT.loginHostPattern,
      portalHostPattern: this.options.portalHostPattern ?? AT.portalHostPattern,
    };
  }

  async fetch(
    session: AuthenticatedAtSession,
    target: { period: string; company: AtCompanyHandle },
  ): Promise<PaymentDocumentFetch> {
    const page = session.page;
    const response = await page.goto(session.urls.obterDocumentoPagamento, {
      waitUntil: "domcontentloaded",
      timeout: this.timeout,
    });
    const year = target.period.slice(0, 4);
    const anoAtivo = await this.filtrarPorAno(page, year);

    // A sessão pode ter morrido (volta ao login) ou o portal pode estar em
    // baixo/sem autorização: isso classifica-se e sai já. O resto — a lista —
    // trata-se lendo a tabela, não por redação.
    const snapshot: AtPageSnapshot = {
      ...(await snapshotPage(page)),
      ...(response === null ? {} : { status: response.status() }),
    };
    const pagina = classifyAtPage(snapshot, this.padroes);
    if (pagina.kind === "authorization_missing") throw new AtAuthError("authorization_missing");
    if (pagina.kind === "maintenance" || pagina.kind === "server_error") {
      throw new AtIntegrityError(
        "at_unexpected_page",
        "O documento de pagamento no Portal das Finanças está indisponível de momento.",
        fingerprint(snapshot),
      );
    }

    // Sem tabela, só a redação distingue um estado normal de uma página
    // desconhecida. Os três desfechos que não são falha devolvem-se como
    // valor; o resto é mudança de contrato e lança com a página assinada.
    if ((await page.locator(AT.paymentDocument.table).count()) === 0) {
      if (pagina.kind === "payment_document_none") return { kind: "no_document" };
      if (pagina.kind === "already_paid") return { kind: "already_paid" };
      if (pagina.kind === "not_ready") return { kind: "not_ready" };
      throw new AtIntegrityError(
        "at_unexpected_page",
        "O documento de pagamento no Portal das Finanças respondeu com uma página inesperada.",
        fingerprint(snapshot),
      );
    }

    // O filtro não tem o ano pedido: a empresa não tem declarações nesse ano, e
    // as linhas no ecrã pertencem ao ano que ficou selecionado.
    if (anoAtivo !== null && anoAtivo !== year) return { kind: "no_document" };

    const header = await page.locator(AT.paymentDocument.headerCells).allInnerTexts();
    const rowsLocator = page.locator(AT.paymentDocument.rows);
    const total = await rowsLocator.count();
    // Tabela vazia: não há declaração cujo documento se possa obter.
    if (total === 0) return { kind: "no_document" };

    const rows: string[][] = [];
    for (let i = 0; i < total; i += 1) {
      rows.push(await rowsLocator.nth(i).locator(AT.paymentDocument.cells).allInnerTexts());
    }

    // Lança `at_unexpected_page` se o cabeçalho não tiver período — adivinhar a
    // coluna custaria a guia do trimestre errado.
    const parsed = parsePaymentRows(header, rows, year);
    if (parsed.length === 0) return { kind: "no_document" };

    // A linha do período pedido (o leitor já escolheu qual). Se a tabela tem
    // declarações mas não a deste período, o documento ainda não foi emitido.
    const alvo =
      parsed.find((r) => r.period === target.period) ?? pickMostRecentPayment(parsed);
    if (alvo === null || alvo.period !== target.period) return { kind: "not_ready" };

    const linha = rowsLocator.nth(alvo.rowIndex);
    const gatilho = linha.locator(AT.paymentDocument.obtainInRow).first();
    await this.exigirGatilho(gatilho, snapshot);

    const capturado = await capturePdf(page, () => gatilho.click({ timeout: this.timeout }), {
      timeoutMs: this.timeout,
    });
    assertPdfIntegrity(capturado.pdf);

    return {
      kind: "document",
      pdf: capturado.pdf,
      // Os campos vêm no PDF, não nesta lista: `source: "none"` →
      // `fetched_without_fields`. O período é o pedido.
      fields: {
        period: target.period,
        entity: null,
        reference: null,
        amount: null,
        nif: null,
        source: "none",
      },
      via: capturado.via,
    };
  }

  /**
   * Aplica o filtro de ano, se ele existir e não estiver já no ano pedido, e
   * devolve o ano que ficou **ativo** — ou `null` se a página não tem filtro.
   *
   * A lista abre no ano corrente; um período de outro ano precisa de trocar o
   * filtro e pesquisar. Se o `select` não tiver o ano (empresa sem declarações
   * nesse ano), fica o que está — e é esse ano que se devolve, para que quem
   * chama saiba que as linhas no ecrã não são as do período pedido.
   */
  private async filtrarPorAno(page: Page, year: string): Promise<string | null> {
    const select = page.locator(AT.paymentDocument.yearInput).first();
    if ((await select.count()) === 0) return null;
    const atual = await select.inputValue().catch(() => "");
    if (atual === year) return atual;
    const temAno =
      (await select.locator(`option[value="${year}"]`).count()) > 0 ||
      (await select.getByRole("option", { name: year }).count()) > 0;
    if (!temAno) return atual;
    await select.selectOption(year, { timeout: this.timeout }).catch(() => undefined);
    const pesquisar = page.locator(AT.paymentDocument.searchButton).first();
    if ((await pesquisar.count()) > 0) {
      await Promise.all([
        page.waitForLoadState("domcontentloaded", { timeout: this.timeout }).catch(() => undefined),
        pesquisar.click({ timeout: this.timeout }).catch(() => undefined),
      ]);
      await page.waitForTimeout(500);
    }
    // Depois da pesquisa a página é outra: lê-se o valor que ficou, não o pedido.
    const depois = page.locator(AT.paymentDocument.yearInput).first();
    if ((await depois.count()) === 0) return year;
    return (await depois.inputValue().catch(() => year)) || year;
  }

  /**
   * O gatilho da linha tem de existir antes de a corrida de captura começar —
   * senão um seletor partido chega lá fora como um `TimeoutError` cru,
   * retentável e sem assinatura. Um gatilho ausente é mudança de contrato:
   * falha alto, uma vez, com a página assinada.
   */
  private async exigirGatilho(gatilho: Locator, snapshot: AtPageSnapshot): Promise<void> {
    await gatilho.waitFor({ state: "attached", timeout: 5_000 }).catch(() => undefined);
    if ((await gatilho.count()) > 0) return;
    throw new AtIntegrityError(
      "at_unexpected_page",
      "A linha do documento de pagamento não tem o botão de obter na página do portal.",
      fingerprint(snapshot),
    );
  }
}
