/**
 * Prazos da declaração periódica do IVA (art. 41.º do CIVA).
 *
 * A declaração de um período P entrega-se até ao **dia 20** do 2.º mês seguinte
 * ao fim de P e paga-se até ao **dia 25** desse mesmo mês. Duas correções em
 * cima disso, ambas como *regra* e não como tabela por ano:
 *
 * 1. **Extensão de verão** — quando o mês de entrega calhava em agosto (só os
 *    períodos `YYYY-06` e `YYYY-Q2`), passa para setembro.
 * 2. **Dia útil** — se o dia 20/25 cair a sábado, domingo ou feriado nacional,
 *    anda para o primeiro dia útil seguinte.
 *
 * Tudo em UTC e em strings ISO `YYYY-MM-DD`: um prazo não tem hora nem fuso, e
 * calcular com o fuso local da máquina do worker faria a data saltar um dia.
 *
 * Nota: este módulo **não** importa `period.ts` de propósito — é `period.ts`
 * que depende daqui (`nextDuePeriod` usa `derivePaymentDueDate`) e um ciclo
 * entre os dois não traria nada.
 */

export interface DueDateOptions {
  /** Extensão de verão (agosto → setembro). Ligada por omissão. */
  summerExtension?: boolean;
  /** `"pt-national"` (omissão) ou uma lista própria de datas ISO. */
  holidays?: "pt-national" | readonly string[];
}

export type DueDates =
  | {
      ok: true;
      /** Prazo de entrega da declaração (dia 20, já em dia útil). */
      filingDeadline: string;
      /** Prazo de pagamento da guia (dia 25, já em dia útil). */
      dueDate: string;
      /** Alguma das duas datas andou por cair em dia não útil. */
      shifted: boolean;
      /** A extensão de verão foi aplicada a este período. */
      summerExtension: boolean;
    }
  | { ok: false; reason: "periodo_invalido" };

/** `YYYY-MM` ou `YYYY-Qn` — a mesma forma canónica de `period.ts`. */
const CANONICAL = /^(\d{4})-(0[1-9]|1[0-2]|Q[1-4])$/;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** Feriados fixos, em `MM-DD`. */
const FIXED_HOLIDAYS = [
  "01-01", // Ano Novo
  "04-25", // Dia da Liberdade
  "05-01", // Dia do Trabalhador
  "06-10", // Dia de Portugal
  "08-15", // Assunção de Nossa Senhora
  "10-05", // Implantação da República
  "11-01", // Todos os Santos
  "12-01", // Restauração da Independência
  "12-08", // Imaculada Conceição
  "12-25", // Natal
] as const;

/**
 * Domingo de Páscoa pelo *computus* gregoriano (Meeus/Jones/Butcher).
 *
 * É uma regra fechada, não uma tabela: uma tabela por ano expira sozinha e
 * ninguém dá por isso até um prazo sair errado.
 */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utcDate(year, month, day);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** Feriados nacionais portugueses do ano, em ISO e por ordem crescente. */
export function ptNationalHolidays(year: number): string[] {
  const easter = easterSunday(year);
  return [
    ...FIXED_HOLIDAYS.map((day) => `${year}-${day}`),
    isoDate(addDays(easter, -2)), // Sexta-feira Santa
    isoDate(addDays(easter, 60)), // Corpo de Deus
  ].sort();
}

/**
 * Dia útil em Portugal: nem fim de semana nem feriado nacional.
 *
 * `holidays` explícito substitui a lista nacional (uma lista vazia diz "sem
 * feriados"); omitido, usa os feriados do ano da própria data.
 */
export function isPtBusinessDay(date: Date, holidays?: readonly string[]): boolean {
  const weekday = date.getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  const list = holidays ?? ptNationalHolidays(date.getUTCFullYear());
  return !list.includes(isoDate(date));
}

/** Último mês civil (1-12) coberto pelo período. */
function endMonthOf(marker: string): number {
  return marker.startsWith("Q") ? Number(marker.slice(1)) * 3 : Number(marker);
}

export function derivePaymentDueDate(period: string, opts?: DueDateOptions): DueDates {
  const match = CANONICAL.exec(period ?? "");
  if (!match) return { ok: false, reason: "periodo_invalido" };

  const year = Number(match[1]);
  const endMonth = endMonthOf(match[2] ?? "");

  // 2.º mês seguinte ao fim do período, com transbordo de ano (Q4 → fevereiro).
  let deliveryYear = year;
  let deliveryMonth = endMonth + 2;
  if (deliveryMonth > 12) {
    deliveryMonth -= 12;
    deliveryYear += 1;
  }

  const summerExtensionEnabled = opts?.summerExtension ?? true;
  const summerExtension = summerExtensionEnabled && deliveryMonth === 8;
  if (summerExtension) deliveryMonth = 9;

  const holidays = opts?.holidays;
  const customHolidays =
    holidays === undefined || holidays === "pt-national" ? undefined : holidays;
  const nextBusinessDay = (date: Date): Date => {
    let cursor = date;
    while (!isPtBusinessDay(cursor, customHolidays)) cursor = addDays(cursor, 1);
    return cursor;
  };

  const filingBase = utcDate(deliveryYear, deliveryMonth, 20);
  const dueBase = utcDate(deliveryYear, deliveryMonth, 25);
  const filing = nextBusinessDay(filingBase);
  const due = nextBusinessDay(dueBase);

  return {
    ok: true,
    filingDeadline: isoDate(filing),
    dueDate: isoDate(due),
    shifted: filing.getTime() !== filingBase.getTime() || due.getTime() !== dueBase.getTime(),
    summerExtension,
  };
}
