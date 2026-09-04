import type { Page, Response } from "playwright";
import { AtAuthError, AtIntegrityError } from "../errors";
import type {
  AtCompanyHandle,
  AuthenticatedAtSession,
  PaymentDocumentFetch,
  PaymentDocumentFetcher,
} from "../runner/ports";
import { classifyAtPage, fingerprint, snapshotPage, type AtPageSnapshot } from "./classify-page";
import { assertPdfIntegrity } from "./guards";
import { parseFieldsFromText } from "./parse-fields";
import { capturePdf } from "./pdf-capture";
import { AT, type AtOptions } from "./selectors";

/**
 * A guia de pagamento: a página, os campos e o PDF.
 *
 * A ordem aqui é a política. **Classificar antes de tudo**, porque metade dos
 * desfechos desta etapa não são falhas — "não há imposto a pagar", "já foi
 * pago", "ainda está em processamento" são estados normais do mês, e tratá-los
 * como erro encheria o dashboard de vermelho por empresas que não têm problema
 * nenhum. Só o que não é nenhum desses e também não é a guia é que lança.
 *
 * **Ler os campos antes de clicar**, porque o clique leva a página embora: no
 * modo inline o próprio separador passa a ser o visor de PDF, e a entidade e a
 * referência que estavam no HTML deixam de existir.
 *
 * E **verificar o PDF antes de o devolver**: um download cortado ou uma página
 * de erro servida com `Content-Type: application/pdf` chegariam ao Storage do
 * gabinete com nome de guia.
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
    let response = await page.goto(session.urls.obterDocumentoPagamento, {
      waitUntil: "domcontentloaded",
      timeout: this.timeout,
    });

    // Há entradas do portal que abrem já na guia e outras que começam por
    // perguntar o período. A presença do campo é que decide — não uma opção
    // de configuração que alguém teria de manter a par do portal.
    if ((await page.locator(AT.paymentDocument.yearInput).count()) > 0) {
      response = await this.escolherPeriodo(page, target.period);
    }

    const snapshot: AtPageSnapshot = {
      ...(await snapshotPage(page)),
      ...(response === null ? {} : { status: response.status() }),
    };
    const pagina = classifyAtPage(snapshot, this.padroes);
    switch (pagina.kind) {
      // Os três desfechos que não são falha: devolvem-se como valor para o
      // runner os distinguir de "não conseguimos".
      case "payment_document_none":
        return { kind: "no_document" };
      case "already_paid":
        return { kind: "already_paid" };
      case "not_ready":
        return { kind: "not_ready" };
      case "authorization_missing":
        throw new AtAuthError("authorization_missing");
      case "payment_document":
        break;
      default:
        throw new AtIntegrityError(
          "at_unexpected_page",
          "O documento de pagamento no Portal das Finanças respondeu com uma página inesperada.",
          fingerprint(snapshot),
        );
    }

    // Antes do clique: a captura pode levar a página para o visor de PDF.
    const texto = await page
      .locator(AT.paymentDocument.fieldsContainer)
      .first()
      .innerText({ timeout: this.timeout });
    const fields = parseFieldsFromText(texto);

    const capturado = await capturePdf(
      page,
      () => page.click(AT.paymentDocument.obtainButton, { timeout: this.timeout }),
      { timeoutMs: this.timeout },
    );
    assertPdfIntegrity(capturado.pdf);

    return {
      kind: "document",
      pdf: capturado.pdf,
      // O período pedido é a rede de segurança quando o HTML não o traz: sem
      // ele o ficheiro ia para o Storage sem saber a que mês pertence.
      fields: { ...fields, period: fields.period ?? target.period },
      via: capturado.via,
    };
  }

  /**
   * Escolhe ano e período no formulário do portal.
   *
   * O trimestre entra como número (`3`), não como o marcador canónico (`Q3`):
   * a forma canónica é nossa, e o portal numera os trimestres de 1 a 4.
   */
  private async escolherPeriodo(page: Page, period: string): Promise<Response | null> {
    const ano = period.slice(0, 4);
    const marcador = period.slice(5);
    const valor = marcador.startsWith("Q") ? marcador.slice(1) : marcador;

    await page.selectOption(AT.paymentDocument.yearInput, ano, { timeout: this.timeout });
    await page.selectOption(AT.paymentDocument.periodInput, valor, { timeout: this.timeout });
    // Sem esperar pela navegação, o snapshot a seguir tanto podia fotografar a
    // página nova como o formulário que acabou de ser submetido.
    const [navegacao] = await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: this.timeout }),
      page.click(AT.paymentDocument.submit, { timeout: this.timeout }),
    ]);
    return navegacao;
  }
}
