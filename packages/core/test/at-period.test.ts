import { describe, it, expect } from "vitest";
import {
  CANONICAL_PERIOD,
  comparePeriods,
  formatPeriodPt,
  nextDuePeriod,
  parsePeriod,
} from "../src/domain/at/period";

/** Fixa o «hoje» para o limite superior do intervalo de anos não depender do relógio. */
const NOW = { now: new Date("2026-09-03T00:00:00Z") };

function canonical(raw: unknown): string {
  const parsed = parsePeriod(raw, NOW);
  if (!parsed.ok) throw new Error(`esperava ok para ${String(raw)}, veio ${parsed.reason}`);
  return parsed.period;
}

describe("CANONICAL_PERIOD", () => {
  it("aceita YYYY-MM e YYYY-Qn e mais nada", () => {
    expect(CANONICAL_PERIOD.test("2026-07")).toBe(true);
    expect(CANONICAL_PERIOD.test("2026-Q3")).toBe(true);
    expect(CANONICAL_PERIOD.test("2026-13")).toBe(false);
    expect(CANONICAL_PERIOD.test("2026-Q5")).toBe(false);
    expect(CANONICAL_PERIOD.test("2026-7")).toBe(false);
  });
});

describe("parsePeriod", () => {
  it("aceita as escritas mensais que aparecem no portal e no formulário", () => {
    for (const raw of [
      "2026/07",
      "2026-07",
      "07/2026",
      "202607",
      "julho 2026",
      "julho de 2026",
      "jul/2026",
      "  JULHO   DE   2026  ",
    ]) {
      expect(canonical(raw), raw).toBe("2026-07");
    }
    expect(canonical("março 2026")).toBe("2026-03");
    expect(canonical("MARÇO de 2026")).toBe("2026-03");
  });

  it("aceita as escritas trimestrais", () => {
    for (const raw of [
      "2026 3T",
      "2026/3T",
      "2026-3T",
      "3T 2026",
      "3T/2026",
      "2026 3.º T",
      "3.º trimestre 2026",
      "2026Q3",
      "2026-Q3",
      "T3 2026",
    ]) {
      expect(canonical(raw), raw).toBe("2026-Q3");
    }
  });

  it("devolve regime, ano e índice", () => {
    expect(parsePeriod("julho de 2026", NOW)).toEqual({
      ok: true,
      period: "2026-07",
      frequency: "monthly",
      year: 2026,
      index: 7,
    });
    expect(parsePeriod("3.º trimestre 2026", NOW)).toEqual({
      ok: true,
      period: "2026-Q3",
      frequency: "quarterly",
      year: 2026,
      index: 3,
    });
  });

  it("mês 13 é mes_invalido", () => {
    expect(parsePeriod("2026-13", NOW)).toEqual({ ok: false, reason: "mes_invalido" });
    expect(parsePeriod("00/2026", NOW)).toEqual({ ok: false, reason: "mes_invalido" });
  });

  it("5T é trimestre_invalido", () => {
    expect(parsePeriod("2026 5T", NOW)).toEqual({ ok: false, reason: "trimestre_invalido" });
    expect(parsePeriod("2026-Q0", NOW)).toEqual({ ok: false, reason: "trimestre_invalido" });
  });

  it("ano fora de [2000, ano atual + 1] é ano_fora_do_intervalo", () => {
    expect(parsePeriod("1999-07", NOW)).toEqual({ ok: false, reason: "ano_fora_do_intervalo" });
    expect(parsePeriod("2028-07", NOW)).toEqual({ ok: false, reason: "ano_fora_do_intervalo" });
    expect(parsePeriod("2027-07", NOW).ok).toBe(true);
    expect(parsePeriod("2000-01", NOW).ok).toBe(true);
  });

  it("é total: lixo, null, número ou objeto dão formato_desconhecido sem lançar", () => {
    for (const raw of ["", "lixo", "abril de", null, undefined, 202607, {}, [], true]) {
      expect(parsePeriod(raw, NOW), String(raw)).toEqual({
        ok: false,
        reason: "formato_desconhecido",
      });
    }
  });
});

describe("comparePeriods", () => {
  it("ordena por ano e último mês do período, misturando regimes", () => {
    const ordered = ["2026-07", "2026-Q2", "2026-06", "2025-12", "2026-Q1"].sort(comparePeriods);
    expect(ordered).toEqual(["2025-12", "2026-Q1", "2026-06", "2026-Q2", "2026-07"]);
  });

  it("no mesmo mês final o trimestre vem depois do mês (cobre mais período)", () => {
    expect(comparePeriods("2026-Q2", "2026-06")).toBeGreaterThan(0);
    expect(comparePeriods("2026-06", "2026-Q2")).toBeLessThan(0);
    expect(comparePeriods("2026-07", "2026-07")).toBe(0);
  });
});

describe("formatPeriodPt", () => {
  it("escreve o período por extenso", () => {
    expect(formatPeriodPt("2026-07")).toBe("julho de 2026");
    expect(formatPeriodPt("2026-01")).toBe("janeiro de 2026");
    expect(formatPeriodPt("2026-Q3")).toBe("3.º trimestre de 2026");
  });

  it("devolve o próprio texto quando o período não é canónico", () => {
    expect(formatPeriodPt("2026-13")).toBe("2026-13");
    expect(formatPeriodPt("")).toBe("");
  });
});

describe("nextDuePeriod", () => {
  it("mensal: o período cujo prazo de entrega é o próximo a expirar", () => {
    // 20/09/2026 é o prazo de entrega de julho e ainda não passou.
    expect(nextDuePeriod(new Date("2026-09-03T00:00:00Z"), "monthly")).toBe("2026-07");
    // Já passou (o prazo andou para 21/09) → passa a agosto.
    expect(nextDuePeriod(new Date("2026-09-25T00:00:00Z"), "monthly")).toBe("2026-08");
  });

  it("trimestral: o mesmo, por trimestre", () => {
    expect(nextDuePeriod(new Date("2026-09-03T00:00:00Z"), "quarterly")).toBe("2026-Q2");
    expect(nextDuePeriod(new Date("2026-10-03T00:00:00Z"), "quarterly")).toBe("2026-Q3");
    expect(nextDuePeriod(new Date("2026-02-10T00:00:00Z"), "quarterly")).toBe("2025-Q4");
  });
});
