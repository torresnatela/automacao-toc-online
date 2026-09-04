import type { IvaFrequency } from "./types";
import { derivePaymentDueDate } from "./due-date";

/**
 * Período do IVA: leitura, forma canónica e ordenação.
 *
 * O período é a chave de tudo o resto (`obligation_periods.period`, o nome do
 * ficheiro no Storage, a deduplicação de jobs), por isso tem de existir **uma**
 * forma canónica — `YYYY-MM` para o regime mensal, `YYYY-Qn` para o trimestral.
 * A entrada, essa, vem de sítios que a escrevem cada um à sua maneira: o
 * operador no formulário, o portal da AT numa tabela, o TOConline noutra.
 *
 * `parsePeriod` é **total: nunca lança.** Devolve a razão da recusa para que o
 * chamador possa dizer ao operador o que está errado em vez de um "inválido".
 */

/** A forma canónica, e só ela. */
export const CANONICAL_PERIOD = /^\d{4}-(0[1-9]|1[0-2]|Q[1-4])$/;

/** Limite inferior do intervalo de anos aceite (o superior é o ano atual + 1). */
const MIN_YEAR = 2000;

export type ParsedPeriod =
  | {
      ok: true;
      period: string;
      frequency: IvaFrequency;
      year: number;
      /** Mês 1-12 no regime mensal; trimestre 1-4 no trimestral. */
      index: number;
    }
  | {
      ok: false;
      reason:
        "formato_desconhecido" | "mes_invalido" | "trimestre_invalido" | "ano_fora_do_intervalo";
    };

const MONTH_NAMES_PT = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

/** Nome ou abreviatura (já sem acentos e em minúsculas) → mês 1-12. */
const MONTH_BY_NAME = new Map<string, number>();
for (const [i, name] of MONTH_NAMES_PT.entries()) {
  const plain = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  MONTH_BY_NAME.set(plain, i + 1);
  MONTH_BY_NAME.set(plain.slice(0, 3), i + 1);
}

/**
 * Reduz a escrita livre a tokens comparáveis: sem acentos, em minúsculas, com
 * os separadores todos virados em espaço e sem o "de" de "julho **de** 2026".
 * Os indicadores ordinais (`3.º`) desaparecem com o ponto que os acompanha.
 */
function normalizeText(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/(\d)\s*\.?\s*[ºª°]/g, "$1")
    .replace(/[/-]/g, " ")
    .replace(/\bde\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Padrões trimestrais; o primeiro grupo é o ano ou o índice, conforme a ordem. */
const QUARTER_PATTERNS: readonly { re: RegExp; yearFirst: boolean }[] = [
  { re: /^(\d{4})\s*(\d{1,2})\s*(?:trimestre|t)$/, yearFirst: true }, // 2026 3t · 2026 3 t
  { re: /^(\d{4})\s*(?:trimestre|q|t)\s*(\d{1,2})$/, yearFirst: true }, // 2026q3 · 2026 t3
  { re: /^(\d{1,2})\s*(?:trimestre|t)\s*(\d{4})$/, yearFirst: false }, // 3t 2026 · 3 trimestre 2026
  { re: /^(?:q|t)\s*(\d{1,2})\s*(\d{4})$/, yearFirst: false }, // t3 2026 · q3 2026
];

/** Padrões mensais numéricos. */
const MONTH_PATTERNS: readonly { re: RegExp; yearFirst: boolean }[] = [
  { re: /^(\d{4})\s*(\d{1,2})$/, yearFirst: true }, // 2026 07 · 202607
  { re: /^(\d{1,2})\s+(\d{4})$/, yearFirst: false }, // 07 2026
];

/** Padrões mensais por nome do mês. */
const MONTH_NAME_PATTERNS: readonly { re: RegExp; yearFirst: boolean }[] = [
  { re: /^([a-z]+)\s+(\d{4})$/, yearFirst: false }, // julho 2026
  { re: /^(\d{4})\s+([a-z]+)$/, yearFirst: true }, // 2026 julho
];

function match(
  text: string,
  patterns: readonly { re: RegExp; yearFirst: boolean }[],
): { year: string; value: string } | null {
  for (const { re, yearFirst } of patterns) {
    const found = re.exec(text);
    if (!found) continue;
    const first = found[1] ?? "";
    const second = found[2] ?? "";
    return yearFirst ? { year: first, value: second } : { year: second, value: first };
  }
  return null;
}

function build(
  frequency: IvaFrequency,
  year: number,
  index: number,
  maxYear: number,
): ParsedPeriod {
  if (frequency === "monthly" && (index < 1 || index > 12)) {
    return { ok: false, reason: "mes_invalido" };
  }
  if (frequency === "quarterly" && (index < 1 || index > 4)) {
    return { ok: false, reason: "trimestre_invalido" };
  }
  if (year < MIN_YEAR || year > maxYear) {
    return { ok: false, reason: "ano_fora_do_intervalo" };
  }
  const period =
    frequency === "monthly" ? `${year}-${String(index).padStart(2, "0")}` : `${year}-Q${index}`;
  return { ok: true, period, frequency, year, index };
}

export function parsePeriod(raw: unknown, opts?: { now?: Date }): ParsedPeriod {
  if (typeof raw !== "string") return { ok: false, reason: "formato_desconhecido" };
  const text = normalizeText(raw);
  if (text === "") return { ok: false, reason: "formato_desconhecido" };

  // Um período futuro para lá do ano que vem é engano de digitação, não pedido.
  const maxYear = (opts?.now ?? new Date()).getUTCFullYear() + 1;

  const quarter = match(text, QUARTER_PATTERNS);
  if (quarter) return build("quarterly", Number(quarter.year), Number(quarter.value), maxYear);

  const month = match(text, MONTH_PATTERNS);
  if (month) return build("monthly", Number(month.year), Number(month.value), maxYear);

  const named = match(text, MONTH_NAME_PATTERNS);
  if (named) {
    const index = MONTH_BY_NAME.get(named.value);
    if (index === undefined) return { ok: false, reason: "formato_desconhecido" };
    return build("monthly", Number(named.year), index, maxYear);
  }

  return { ok: false, reason: "formato_desconhecido" };
}

/** Ano, último mês coberto e amplitude — a chave de ordenação de um período. */
function rank(period: string): { year: number; lastMonth: number; span: number } | null {
  if (!CANONICAL_PERIOD.test(period)) return null;
  const year = Number(period.slice(0, 4));
  const marker = period.slice(5);
  return marker.startsWith("Q")
    ? { year, lastMonth: Number(marker.slice(1)) * 3, span: 3 }
    : { year, lastMonth: Number(marker), span: 1 };
}

/**
 * Ordena períodos de regimes diferentes: `2026-07 > 2026-Q2 > 2026-06`.
 *
 * A chave é (ano, último mês); quando o último mês coincide — junho fecha tanto
 * `2026-06` como `2026-Q2` — vence o que cobre mais período. Períodos não
 * canónicos ficam à frente de todos, para não se perderem numa lista ordenada.
 */
export function comparePeriods(a: string, b: string): number {
  const left = rank(a);
  const right = rank(b);
  if (!left || !right) {
    if (!left && !right) return a.localeCompare(b);
    return left ? 1 : -1;
  }
  return left.year - right.year || left.lastMonth - right.lastMonth || left.span - right.span;
}

/** `"julho de 2026"` · `"3.º trimestre de 2026"`; não canónico devolve-se tal como veio. */
export function formatPeriodPt(period: string): string {
  const parsed = rank(period);
  if (!parsed) return period;
  if (parsed.span === 3) return `${parsed.lastMonth / 3}.º trimestre de ${parsed.year}`;
  const name = MONTH_NAMES_PT[parsed.lastMonth - 1];
  return name === undefined ? period : `${name} de ${parsed.year}`;
}

function shift(unit: number, total: number, delta: number): { year: number; index: number } {
  const moved = total + delta;
  return { year: Math.floor(moved / unit), index: (moved % unit) + 1 };
}

function monthPeriod({ year, index }: { year: number; index: number }): string {
  return `${year}-${String(index).padStart(2, "0")}`;
}

function quarterPeriod({ year, index }: { year: number; index: number }): string {
  return `${year}-Q${index}`;
}

/**
 * O período cujo prazo de **entrega** é o próximo a expirar (ou expira hoje).
 *
 * É o período que o operador quer buscar quando não indica nenhum. No regime
 * mensal o candidato natural é o mês−2 (é dele o prazo que corre no mês atual);
 * passado esse prazo, o candidato é o mês−1. No trimestral vale o mesmo
 * raciocínio, um trimestre de cada vez.
 */
export function nextDuePeriod(today: Date, frequency: IvaFrequency): string {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth() + 1;
  const todayIso = today.toISOString().slice(0, 10);

  let candidate: string;
  let fallback: string;
  if (frequency === "monthly") {
    candidate = monthPeriod(shift(12, year * 12 + (month - 1), -2));
    fallback = monthPeriod(shift(12, year * 12 + (month - 1), -1));
  } else {
    const quarter = Math.ceil(month / 3);
    candidate = quarterPeriod(shift(4, year * 4 + (quarter - 1), -1));
    fallback = quarterPeriod({ year, index: quarter });
  }

  const deadline = derivePaymentDueDate(candidate);
  if (deadline.ok && todayIso <= deadline.filingDeadline) return candidate;
  return fallback;
}
