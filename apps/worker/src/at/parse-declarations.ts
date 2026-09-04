import { comparePeriods, parsePeriod } from "@toc/core/domain";
import { AtIntegrityError } from "../errors";

/**
 * A tabela de declarações periódicas da AT, lida como dados.
 *
 * Puro de propósito: a leitura do DOM fica no adaptador, e aqui só entram duas
 * listas de strings. É o que permite provar com um teste de meio segundo aquilo
 * que de outra forma precisaria do portal real — e o que importa provar é uma
 * coisa só: **as colunas localizam-se pelo TEXTO do cabeçalho, nunca pelo
 * índice**. Uma coluna nova inserida à esquerda não pode fazer o worker ler a
 * data como período e descarregar a guia do mês errado.
 *
 * Quando o cabeçalho não tem período, isto lança. É a diferença entre falhar e
 * adivinhar, e adivinhar aqui custa uma guia trocada no Storage do gabinete.
 */

export interface DeclarationRow {
  /** Já canónico (`YYYY-MM` ou `YYYY-Qn`) — as linhas ilegíveis nem chegam cá. */
  period: string;
  /** Como o portal a escreveu; a normalização é de quem comparar. */
  submittedAt: string | null;
  state: string | null;
  replacement: boolean;
}

/** Sem acentos e em minúsculas: o cabeçalho da AT alterna "Período" e "PERIODO". */
function plain(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Palavras que identificam cada coluna. São fragmentos (`submiss`, `situa`)
 * porque a AT escreve tanto "Submissão" como "Submetida", e um fragmento
 * apanha as duas sem uma lista interminável de variantes.
 */
const COLUMN_KEYWORDS = {
  period: ["periodo", "per."],
  submittedAt: ["data", "entrega", "submiss"],
  state: ["tipo", "estado", "situa"],
} as const;

/** Primeira coluna por reclamar cujo texto contenha uma das palavras. */
function findColumn(
  header: readonly string[],
  keywords: readonly string[],
  taken: Set<number>,
): number | null {
  for (const [index, cell] of header.entries()) {
    if (taken.has(index)) continue;
    const text = plain(cell);
    if (keywords.some((keyword) => text.includes(keyword))) {
      taken.add(index);
      return index;
    }
  }
  return null;
}

/** Célula por índice, já aparada; `null` quando não existe ou está vazia. */
function cellAt(row: readonly string[], index: number | null): string | null {
  if (index === null) return null;
  const raw = row[index];
  if (raw === undefined) return null;
  const text = raw.trim();
  return text === "" ? null : text;
}

export function parseDeclarationRows(
  header: readonly string[],
  rows: readonly (readonly string[])[],
): DeclarationRow[] {
  const taken = new Set<number>();
  const periodColumn = findColumn(header, COLUMN_KEYWORDS.period, taken);
  if (periodColumn === null) {
    throw new AtIntegrityError(
      "at_unexpected_page",
      "tabela de declarações sem coluna de período",
      { header: header.map(plain) },
    );
  }
  const dateColumn = findColumn(header, COLUMN_KEYWORDS.submittedAt, taken);
  const stateColumn = findColumn(header, COLUMN_KEYWORDS.state, taken);

  const parsed: DeclarationRow[] = [];
  for (const row of rows) {
    // Linhas de total, de paginação ou de "nenhum resultado" entram na tabela
    // como todas as outras. Ignorar as que não têm período legível é certo; o
    // total de linhas vistas continua a ser `rows.length`, para quem o quiser
    // registar como `rowsSeen`.
    const period = parsePeriod(cellAt(row, periodColumn));
    if (!period.ok) continue;

    const state = cellAt(row, stateColumn);
    parsed.push({
      period: period.period,
      submittedAt: cellAt(row, dateColumn),
      state,
      replacement: state !== null && plain(state).includes("substitui"),
    });
  }
  return parsed;
}

/**
 * A data de submissão como número comparável, ou `null` se ilegível.
 *
 * Três formatos porque são os três que já se viram no portal; um quarto formato
 * dá `null`, e `null` nunca vence uma data legível.
 */
function submissionRank(raw: string | null): number | null {
  if (raw === null) return null;
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return Number(`${iso[1]}${iso[2]}${iso[3]}`);
  const pt = /(\d{2})[-/](\d{2})[-/](\d{4})/.exec(raw);
  if (pt) return Number(`${pt[3]}${pt[2]}${pt[1]}`);
  return null;
}

/**
 * A declaração que interessa: a do período mais alto e, dentro dele, a última
 * submissão.
 *
 * O empate não é caso de canto — é a substituição, e é a razão de a função
 * existir. Quando o contabilista corrige uma declaração, a AT deixa as duas
 * linhas na tabela com o mesmo período; escolher a errada dá a guia do valor
 * antigo. Ordem de desempate: período → data de submissão → a marcada como
 * substituição → a que vier mais abaixo na tabela.
 */
export function pickMostRecentDeclaration(rows: readonly DeclarationRow[]): DeclarationRow | null {
  let best: DeclarationRow | null = null;
  let bestRank: number | null = null;

  for (const candidate of rows) {
    if (best === null) {
      best = candidate;
      bestRank = submissionRank(candidate.submittedAt);
      continue;
    }

    const byPeriod = comparePeriods(candidate.period, best.period);
    if (byPeriod < 0) continue;
    if (byPeriod === 0) {
      const rank = submissionRank(candidate.submittedAt);
      if (rank === null && bestRank !== null) continue;
      if (rank !== null && bestRank !== null && rank < bestRank) continue;
      if (rank === bestRank && best.replacement && !candidate.replacement) continue;
    }

    best = candidate;
    bestRank = submissionRank(candidate.submittedAt);
  }

  return best;
}
