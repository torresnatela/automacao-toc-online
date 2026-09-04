import { AtAuthError, AtIntegrityError } from "../errors";
import type {
  AtCompanyHandle,
  AuthenticatedAtSession,
  DeclarationRead,
  IvaDeclarationReader,
} from "../runner/ports";
import { classifyAtPage, fingerprint, snapshotPage, type AtPageSnapshot } from "./classify-page";
import { parseDeclarationRows, pickMostRecentDeclaration } from "./parse-declarations";
import { AT, type AtOptions } from "./selectors";

/**
 * A declaração periódica mais recente, lida da tabela do portal.
 *
 * Este ficheiro faz **só** duas coisas que precisam de um browser: classificar a
 * página e transcrever a tabela para duas listas de strings. A escolha — qual
 * das linhas é "a mais recente", e o que fazer quando o mesmo período aparece
 * duas vezes — vive em `parse-declarations.ts`, pura, porque é aí que está o
 * risco (escolher a linha errada dá a guia do valor antigo) e é aí que se pode
 * provar sem portal nenhum.
 *
 * `rowsSeen` conta as linhas da tabela, não as que se conseguiu ler: é o que
 * distingue "a tabela estava vazia" de "a tabela mudou e nada foi entendido",
 * duas coisas que sem ele chegariam ao dashboard como o mesmo `none`.
 */
export class AtIvaDeclarationReader implements IvaDeclarationReader {
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

  async readMostRecent(
    session: AuthenticatedAtSession,
    _company: AtCompanyHandle,
  ): Promise<DeclarationRead> {
    const page = session.page;
    const response = await page.goto(session.urls.consultarDeclaracao, {
      waitUntil: "domcontentloaded",
      timeout: this.timeout,
    });
    const snapshot: AtPageSnapshot = {
      ...(await snapshotPage(page)),
      ...(response === null ? {} : { status: response.status() }),
    };

    const pagina = classifyAtPage(snapshot, this.padroes);
    // "Não há declarações" é um desfecho válido do negócio, não uma falha: a
    // empresa pode simplesmente ainda não ter entregue nada.
    if (pagina.kind === "declaration_none") return { kind: "none", rowsSeen: 0 };
    if (pagina.kind === "authorization_missing") throw new AtAuthError("authorization_missing");
    if (pagina.kind !== "declaration_list") {
      throw new AtIntegrityError(
        "at_unexpected_page",
        "A consulta de declarações no Portal das Finanças respondeu com uma página inesperada.",
        fingerprint(snapshot),
      );
    }

    const header = await page.locator(AT.declarations.headerCells).allInnerTexts();
    const linhas = page.locator(AT.declarations.rows);
    const total = await linhas.count();
    const rows: string[][] = [];
    for (let i = 0; i < total; i += 1) {
      // Célula a célula e não uma `evaluate` sobre a tabela inteira: o worker
      // não carrega a lib DOM do TypeScript, e `allInnerTexts` dá exatamente o
      // que o parser espera — o texto visível, na ordem do documento.
      rows.push(await linhas.nth(i).locator(AT.declarations.cells).allInnerTexts());
    }

    // Lança se o cabeçalho não tiver coluna de período: adivinhar por índice
    // custaria a guia do mês errado no Storage do gabinete.
    const parsed = parseDeclarationRows(header, rows);
    const escolhida = pickMostRecentDeclaration(parsed);
    if (escolhida === null) return { kind: "none", rowsSeen: rows.length };

    return {
      kind: "found",
      period: escolhida.period,
      submittedAt: escolhida.submittedAt,
      replacement: escolhida.replacement,
      rowsSeen: rows.length,
    };
  }
}
