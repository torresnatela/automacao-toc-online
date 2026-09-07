import type { Locator, Page } from "playwright";
import { fingerprint, snapshotPage } from "../at/classify-page";
import { assertPdfIntegrity } from "../at/guards";
import { capturePdf, type CapturedPdf } from "../at/pdf-capture";
import { AtIntegrityError, AtTransientError } from "../errors";
import type { AtCompanyHandle, AuthenticatedAtSession, PdfVia, SessionLog } from "../runner/ports";
import { SS, type SsOptions } from "./selectors";

/** Quanto se espera por um menu que a classificação já deu por presente. */
const ESPERA_DE_MENU_MS = 8_000;
/** Peças opcionais (separador «Pagamentos», a opção de representação). */
const ESPERA_OPCIONAL_MS = 3_000;
/** Quanto se espera que uma confirmação traga o PDF antes de se assumir que aterrou numa página. */
const ESPERA_DE_CONFIRMACAO_MS = 5_000;
/** O botão de confirmação entre a escolha do Multibanco e a referência. */
const CONFIRMACAO = /confirmar|continuar|seguinte|emitir|gerar|avan[çc]ar/i;

/** Os campos do aviso Multibanco como a SSD os deu, ainda por normalizar. */
export interface SsDocumentFields {
  amount: string | null;
  entity: string | null;
  reference: string | null;
  source: "html" | "none";
}

/**
 * "Nada a pagar" não é exceção: é um valor devolvido pela porta, para quem
 * chama distinguir "a empresa está em dia" (estado normal) de "falhou".
 */
export type SsPaymentDocumentFetch =
  | { kind: "document"; pdf: Buffer; fields: SsDocumentFields; via: PdfVia }
  | { kind: "nothing_to_pay" };

/**
 * O documento de pagamento (referência Multibanco) das contribuições à
 * Segurança Social, a partir de uma sessão já aberta na SSD.
 *
 * O percurso é o do gabinete: Pagamentos e Dívidas → Valores a pagar à
 * Segurança Social → Pagamentos → Fazer pagamento → «pedir para atuar em nome
 * próprio» → Pagar → Multibanco → PDF.
 *
 * Duas regras herdadas da AT: **ler os campos antes do clique** que traz o
 * PDF (o clique pode levar a página para o visor), e **verificar o PDF antes
 * de o devolver**. E uma própria: a SSD navega-se por **texto** — menus e
 * botões encontram-se pelo que dizem, não por `id`s, porque é isso que se
 * conhece dela antes da Fase 0. Cada passo deixa um marco no `log` para, ao
 * primeiro ensaio real, se saber exatamente onde o percurso parou.
 */
export class SsPaymentDocumentFetcher {
  constructor(private readonly options: SsOptions = {}) {}

  private get timeout(): number {
    return this.options.timeoutMs ?? SS.defaultTimeoutMs;
  }

  async fetch(
    session: AuthenticatedAtSession,
    input: { company: AtCompanyHandle; log?: SessionLog },
  ): Promise<SsPaymentDocumentFetch> {
    const page = session.page;
    const log = input.log;

    await this.clicar(page, SS.menu.pagamentosEDividas, "Pagamentos e Dívidas");
    await log?.info("ss menu", { step: "pagamentos_e_dividas", path: caminho(page) });

    await this.clicar(page, SS.menu.valoresAPagar, "Valores a pagar à Segurança Social");
    await log?.info("ss menu", { step: "valores_a_pagar", path: caminho(page) });

    // O separador «Pagamentos» pode já ser o ativo: opcional de propósito.
    const separador = await this.clicarSeExistir(page, SS.menu.pagamentos);
    await log?.info("ss menu", { step: "pagamentos", clicked: separador, path: caminho(page) });

    await this.clicar(page, SS.menu.fazerPagamento, "Fazer pagamento");
    await log?.info("ss menu", { step: "fazer_pagamento", path: caminho(page) });

    const representacao = await this.marcarSeExistir(page, SS.pagamento.atuarEmNomeProprio);
    await log?.info("ss pagamento", { step: "atuar_em_nome_proprio", checked: representacao });

    // Só agora a SSD mostra o valor — ou diz que não há nada a pagar.
    const texto = await this.textoDaPagina(page);
    if (SS.wording.nothingToPay.test(texto)) {
      await log?.info("ss pagamento", { step: "nothing_to_pay" });
      return { kind: "nothing_to_pay" };
    }
    const valor = SS.wording.amount.exec(texto)?.[1] ?? null;
    if (valor === null) {
      throw new AtIntegrityError(
        "at_unexpected_page",
        "A Segurança Social Direta não mostrou o valor a pagar nem disse que não há nada a pagar.",
        fingerprint(await snapshotPage(page)),
      );
    }
    await log?.info("ss pagamento", { step: "amount_read" });

    await this.clicar(page, SS.pagamento.pagar, "Pagar");
    await log?.info("ss pagamento", { step: "pagar", path: caminho(page) });

    await this.escolher(page, SS.pagamento.multibanco, "Multibanco");
    await log?.info("ss pagamento", { step: "multibanco", path: caminho(page) });

    // Antes de qualquer clique que possa levar a página para o visor de PDF:
    // o que já estiver à vista (entidade/referência) lê-se agora.
    let fields = lerCampos(await this.textoDaPagina(page), { amount: valor });

    // A SSD pode mostrar logo o botão do documento, ou pedir uma confirmação
    // antes — e essa confirmação tanto pode aterrar na página da referência
    // como emitir o PDF ali mesmo. Cobre-se os três sem saber qual é.
    let capturado: CapturedPdf | null = null;
    let documento = await this.primeiroVisivel(page, SS.pagamento.documento, ESPERA_OPCIONAL_MS);
    if (documento === null) {
      const confirmar = await this.primeiroVisivel(page, CONFIRMACAO, ESPERA_OPCIONAL_MS);
      if (confirmar === null) throw await this.semBotaoDoDocumento(page);
      capturado = await capturePdf(page, () => confirmar.click({ timeout: this.timeout }), {
        timeoutMs: ESPERA_DE_CONFIRMACAO_MS,
      }).catch((err: unknown) => {
        // Sem PDF na confirmação não é falha: a referência vem na página seguinte.
        if (err instanceof AtTransientError) return null;
        throw err;
      });
      await log?.info("ss pagamento", { step: "confirmar", pdf: capturado !== null, path: caminho(page) });
      if (capturado === null) {
        await page.waitForLoadState("domcontentloaded", { timeout: this.timeout }).catch(() => undefined);
        fields = lerCampos(await this.textoDaPagina(page), fields);
        documento = await this.primeiroVisivel(page, SS.pagamento.documento, ESPERA_DE_MENU_MS);
        if (documento === null) throw await this.semBotaoDoDocumento(page);
      }
    }
    if (capturado === null) {
      const botao = documento!;
      capturado = await capturePdf(page, () => botao.click({ timeout: this.timeout }), {
        timeoutMs: this.timeout,
      });
    }
    assertPdfIntegrity(capturado.pdf);
    await log?.info("ss pagamento", { step: "pdf_captured", via: capturado.via, bytes: capturado.pdf.length });

    return { kind: "document", pdf: capturado.pdf, fields, via: capturado.via };
  }

  /* ---------------------------------------------------------------------- *
   * Navegação por texto
   * ---------------------------------------------------------------------- */

  /**
   * O primeiro elemento clicável cujo nome acessível (ou texto) bate no
   * padrão: ligações, botões, separadores e itens de menu, por esta ordem.
   */
  private candidatos(page: Page, padrao: RegExp): Locator[] {
    return [
      page.getByRole("link", { name: padrao }),
      page.getByRole("button", { name: padrao }),
      page.getByRole("tab", { name: padrao }),
      page.getByRole("menuitem", { name: padrao }),
      page.getByText(padrao),
    ];
  }

  private async primeiroVisivel(page: Page, padrao: RegExp, timeoutMs: number): Promise<Locator | null> {
    const fim = Date.now() + timeoutMs;
    for (;;) {
      for (const candidato of this.candidatos(page, padrao)) {
        const primeiro = candidato.first();
        if (await primeiro.isVisible().catch(() => false)) return primeiro;
      }
      if (Date.now() >= fim) return null;
      await page.waitForTimeout(200).catch(() => undefined);
    }
  }

  /**
   * Um menu que não existe é uma mudança de contrato: falha alto, uma vez,
   * com a página assinada — não um `TimeoutError` cru três retentativas
   * depois.
   */
  private async clicar(page: Page, padrao: RegExp, rotulo: string): Promise<void> {
    const alvo = await this.primeiroVisivel(page, padrao, ESPERA_DE_MENU_MS);
    if (alvo === null) {
      throw new AtIntegrityError(
        "at_unexpected_page",
        `A Segurança Social Direta não mostra «${rotulo}». O fluxo mudou.`,
        fingerprint(await snapshotPage(page)),
      );
    }
    await alvo.click({ timeout: this.timeout });
    await page.waitForLoadState("domcontentloaded", { timeout: this.timeout }).catch(() => undefined);
  }

  private async clicarSeExistir(page: Page, padrao: RegExp): Promise<boolean> {
    const alvo = await this.primeiroVisivel(page, padrao, ESPERA_OPCIONAL_MS);
    if (alvo === null) return false;
    await alvo.click({ timeout: this.timeout });
    await page.waitForLoadState("domcontentloaded", { timeout: this.timeout }).catch(() => undefined);
    return true;
  }

  /** Marca a opção (checkbox/rádio) com aquele rótulo, se existir e estiver por marcar. */
  private async marcarSeExistir(page: Page, padrao: RegExp): Promise<boolean> {
    const porRotulo = page.getByLabel(padrao).first();
    const porPapel = page.getByRole("checkbox", { name: padrao }).first();
    const porTexto = page.getByText(padrao).first();
    for (const alvo of [porRotulo, porPapel]) {
      if (await alvo.isVisible().catch(() => false)) {
        if (!(await alvo.isChecked().catch(() => false))) await alvo.check({ timeout: this.timeout });
        return true;
      }
    }
    if (await porTexto.isVisible().catch(() => false)) {
      await porTexto.click({ timeout: this.timeout });
      return true;
    }
    return false;
  }

  /** Um meio de pagamento: rádio, botão ou cartão com aquele nome. */
  private async escolher(page: Page, padrao: RegExp, rotulo: string): Promise<void> {
    const radio = page.getByRole("radio", { name: padrao }).first();
    if (await radio.isVisible().catch(() => false)) {
      await radio.check({ timeout: this.timeout });
      return;
    }
    const porRotulo = page.getByLabel(padrao).first();
    if (await porRotulo.isVisible().catch(() => false)) {
      await porRotulo.check({ timeout: this.timeout }).catch(() => porRotulo.click({ timeout: this.timeout }));
      return;
    }
    await this.clicar(page, padrao, rotulo);
  }

  private async semBotaoDoDocumento(page: Page): Promise<AtIntegrityError> {
    return new AtIntegrityError(
      "at_unexpected_page",
      "A Segurança Social Direta não mostra o botão que emite o documento de pagamento.",
      fingerprint(await snapshotPage(page)),
    );
  }

  private async textoDaPagina(page: Page): Promise<string> {
    // A SSD pode renderizar o valor um instante depois da opção de representação.
    await page.waitForLoadState("networkidle", { timeout: ESPERA_OPCIONAL_MS }).catch(() => undefined);
    const contentor = page.locator(SS.pagamento.fieldsContainer).first();
    try {
      return (await contentor.innerText({ timeout: ESPERA_OPCIONAL_MS })).replace(/\s+/g, " ");
    } catch {
      return "";
    }
  }
}

/** Entidade, referência e valor tal como a SSD os escreve; o que faltar fica do que já se sabia. */
function lerCampos(texto: string, anterior: Partial<SsDocumentFields>): SsDocumentFields {
  return {
    amount: SS.wording.amount.exec(texto)?.[1] ?? anterior.amount ?? null,
    entity: SS.wording.entity.exec(texto)?.[1] ?? anterior.entity ?? null,
    reference: SS.wording.reference.exec(texto)?.[1]?.replace(/\s/g, "") ?? anterior.reference ?? null,
    source: "html",
  };
}

/** Só o caminho, nunca a query: na SSD pode levar identificadores. */
function caminho(page: Page): string {
  try {
    return new URL(page.url()).pathname;
  } catch {
    return "";
  }
}
