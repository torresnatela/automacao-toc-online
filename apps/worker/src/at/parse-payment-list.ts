import { comparePeriods, parsePeriod } from "@toc/core/domain";
import { AtIntegrityError } from "../errors";

/**
 * A tabela de `obter-doc-pagamento` do Portal das Finanças, lida como dados.
 *
 * A página lista uma declaração por linha — «Identificação | Período | Data de
 * receção | [Obter documento de pagamento]» (reconhecimento de 2026-09-07) —
 * e o **período da linha só traz o trimestre** (`3T`); o ano vem do filtro
 * «Ano» da própria página. Por isso o período canónico compõe-se dos dois:
 * `parsePeriod("2026 3T")` → `2026-Q3`.
 *
 * Puro de propósito: a leitura do DOM e a escolha do ano ficam no adaptador,
 * e aqui só entram o cabeçalho, as linhas e o ano. É o que permite provar com
 * um teste de meio segundo que as colunas se localizam pelo **texto** do
 * cabeçalho (nunca pelo índice) e que a linha mais recente é a certa.
 *
 * O `rowIndex` volta com cada linha porque é ele que o adaptador usa para
 * clicar no link «Obter documento de pagamento» **daquela** linha.
 */

export interface PaymentRow {
  /** Já canónico (`YYYY-Qn` / `YYYY-MM`); as linhas ilegíveis nem chegam cá. */
  period: string;
  /** Como o portal a escreveu; a normalização é de quem comparar. */
  receivedAt: string | null;
  /** Posição na tabela — a chave para clicar no link certo. */
  rowIndex: number;
}

function plain(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

const COLUMN_KEYWORDS = {
  period: ["periodo", "per."],
  receivedAt: ["rece", "data"],
} as const;

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

function cellAt(row: readonly string[], index: number | null): string | null {
  if (index === null) return null;
  const raw = row[index];
  if (raw === undefined) return null;
  const text = raw.trim();
  return text === "" ? null : text;
}

export function parsePaymentRows(
  header: readonly string[],
  rows: readonly (readonly string[])[],
  year: string,
): PaymentRow[] {
  const taken = new Set<number>();
  const periodColumn = findColumn(header, COLUMN_KEYWORDS.period, taken);
  if (periodColumn === null) {
    throw new AtIntegrityError(
      "at_unexpected_page",
      "tabela de obter-documento sem coluna de período",
      { header: header.map(plain) },
    );
  }
  const dateColumn = findColumn(header, COLUMN_KEYWORDS.receivedAt, taken);

  const parsed: PaymentRow[] = [];
  for (const [rowIndex, row] of rows.entries()) {
    const raw = cellAt(row, periodColumn);
    if (raw === null) continue;
    // O ano vem do filtro; a linha traz só o trimestre (`3T`) ou o mês.
    // `parsePeriod` aceita "2026 3T" — se o valor já trouxer um ano (defesa),
    // tenta-se tal como está primeiro.
    const period = parsePeriod(raw).ok ? parsePeriod(raw) : parsePeriod(`${year} ${raw}`);
    if (!period.ok) continue;
    parsed.push({ period: period.period, receivedAt: cellAt(row, dateColumn), rowIndex });
  }
  return parsed;
}

function receivedRank(raw: string | null): number | null {
  if (raw === null) return null;
  const iso = /(\d{4})-(\d{2})-(\d{2})[ T]?(\d{2})?:?(\d{2})?:?(\d{2})?/.exec(raw);
  if (iso) {
    return Number(
      `${iso[1]}${iso[2]}${iso[3]}${iso[4] ?? "00"}${iso[5] ?? "00"}${iso[6] ?? "00"}`,
    );
  }
  const pt = /(\d{2})[-/](\d{2})[-/](\d{4})/.exec(raw);
  if (pt) return Number(`${pt[3]}${pt[2]}${pt[1]}000000`);
  return null;
}

/**
 * A declaração cujo documento interessa: a mais recente por data de receção e,
 * em empate, o período mais alto e a linha que vem primeiro.
 */
export function pickMostRecentPayment(rows: readonly PaymentRow[]): PaymentRow | null {
  let best: PaymentRow | null = null;
  let bestRank: number | null = null;
  for (const candidate of rows) {
    if (best === null) {
      best = candidate;
      bestRank = receivedRank(candidate.receivedAt);
      continue;
    }
    const rank = receivedRank(candidate.receivedAt);
    if (rank !== null && bestRank !== null) {
      if (rank < bestRank) continue;
      if (rank === bestRank && comparePeriods(candidate.period, best.period) <= 0) continue;
    } else if (rank === null && bestRank !== null) {
      continue;
    }
    best = candidate;
    bestRank = rank;
  }
  return best;
}
