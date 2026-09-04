import { describe, it, expect } from "vitest";
import {
  derivePaymentDueDate,
  isPtBusinessDay,
  ptNationalHolidays,
} from "../src/domain/at/due-date";

/** Atalho: só o par (entrega, pagamento) do período. */
function dates(period: string, opts?: Parameters<typeof derivePaymentDueDate>[1]) {
  const result = derivePaymentDueDate(period, opts);
  if (!result.ok) throw new Error(`esperava ok para ${period}`);
  return [result.filingDeadline, result.dueDate] as const;
}

describe("derivePaymentDueDate — regra do art. 41.º do CIVA", () => {
  it("mensal: dia 20 / dia 25 do 2.º mês seguinte", () => {
    expect(dates("2025-12")).toEqual(["2026-02-20", "2026-02-25"]);
    expect(derivePaymentDueDate("2025-12")).toMatchObject({
      ok: true,
      shifted: false,
      summerExtension: false,
    });
  });

  it("trimestral: Q1→maio, Q2→agosto, Q3→novembro, Q4→fevereiro do ano seguinte", () => {
    expect(dates("2026-Q1")).toEqual(["2026-05-20", "2026-05-25"]);
    // Q2 cai em agosto e é deslocado pela extensão de verão.
    expect(dates("2026-Q2")[1]).toBe("2026-09-25");
    expect(dates("2026-Q3")).toEqual(["2026-11-20", "2026-11-25"]);
    expect(dates("2026-Q4")[1]).toBe("2027-02-25");
  });

  describe("dia útil", () => {
    it("25/04/2026 é sábado E feriado (Dia da Liberdade) → 27/04", () => {
      const result = derivePaymentDueDate("2026-02");
      expect(result).toMatchObject({ ok: true, filingDeadline: "2026-04-20", shifted: true });
      expect(dates("2026-02")[1]).toBe("2026-04-27");
    });

    it("25/07/2026 é sábado → 27/07", () => {
      expect(dates("2026-05")).toEqual(["2026-07-20", "2026-07-27"]);
    });

    it("25/12/2026 é sexta-feira mas é Natal → 28/12", () => {
      expect(dates("2026-10")[1]).toBe("2026-12-28");
    });

    it("marca shifted quando qualquer uma das datas anda", () => {
      // 20/02/2027 é sábado; o pagamento (25) fica na quinta.
      expect(derivePaymentDueDate("2026-Q4")).toMatchObject({
        ok: true,
        filingDeadline: "2027-02-22",
        dueDate: "2027-02-25",
        shifted: true,
      });
    });
  });

  describe("extensão de verão", () => {
    it("2026-06 entregar-se-ia em agosto → passa a setembro", () => {
      expect(derivePaymentDueDate("2026-06")).toMatchObject({
        ok: true,
        dueDate: "2026-09-25",
        summerExtension: true,
      });
    });

    it("com summerExtension:false fica em agosto", () => {
      expect(derivePaymentDueDate("2026-06", { summerExtension: false })).toMatchObject({
        ok: true,
        dueDate: "2026-08-25",
        summerExtension: false,
      });
    });

    it("não se aplica a períodos cujo mês de entrega não é agosto", () => {
      expect(derivePaymentDueDate("2026-07")).toMatchObject({
        ok: true,
        dueDate: "2026-09-25",
        summerExtension: false,
      });
    });
  });

  it("aceita uma lista de feriados própria", () => {
    // Sem feriados nacionais, 25/12/2026 (sexta) deixa de andar.
    expect(dates("2026-10", { holidays: [] })[1]).toBe("2026-12-25");
  });

  it("período inválido não lança — devolve {ok:false}", () => {
    for (const period of ["2026-13", "julho de 2026", "", "2026-Q5", "lixo"]) {
      expect(derivePaymentDueDate(period), period).toEqual({
        ok: false,
        reason: "periodo_invalido",
      });
    }
  });
});

describe("ptNationalHolidays", () => {
  it("inclui os dez feriados fixos", () => {
    const holidays = ptNationalHolidays(2026);
    for (const day of [
      "2026-01-01",
      "2026-04-25",
      "2026-05-01",
      "2026-06-10",
      "2026-08-15",
      "2026-10-05",
      "2026-11-01",
      "2026-12-01",
      "2026-12-08",
      "2026-12-25",
    ]) {
      expect(holidays, day).toContain(day);
    }
  });

  it("calcula os móveis por computus: Páscoa 2026 = 05/04", () => {
    // Sexta-feira Santa = Páscoa − 2; Corpo de Deus = Páscoa + 60.
    expect(ptNationalHolidays(2026)).toContain("2026-04-03");
    expect(ptNationalHolidays(2026)).toContain("2026-06-04");
    // Páscoa 2027 = 28/03 → Sexta-feira Santa 26/03, Corpo de Deus 27/05.
    expect(ptNationalHolidays(2027)).toContain("2027-03-26");
    expect(ptNationalHolidays(2027)).toContain("2027-05-27");
  });
});

describe("isPtBusinessDay", () => {
  it("fim de semana e feriado não são dias úteis", () => {
    expect(isPtBusinessDay(new Date("2026-04-25T00:00:00Z"))).toBe(false); // sábado + feriado
    expect(isPtBusinessDay(new Date("2026-04-26T00:00:00Z"))).toBe(false); // domingo
    expect(isPtBusinessDay(new Date("2026-12-25T00:00:00Z"))).toBe(false); // sexta, Natal
    expect(isPtBusinessDay(new Date("2026-04-27T00:00:00Z"))).toBe(true); // segunda
  });

  it("com lista de feriados própria ignora os nacionais", () => {
    expect(isPtBusinessDay(new Date("2026-12-25T00:00:00Z"), [])).toBe(true);
  });
});
