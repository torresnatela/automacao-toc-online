import { describe, it, expect } from "vitest";
import {
  parseDeclarationRows,
  pickMostRecentDeclaration,
  type DeclarationRow,
} from "../../src/at/parse-declarations";
import { AtIntegrityError } from "../../src/errors";

describe("parseDeclarationRows", () => {
  it("localiza as colunas pelo texto do cabeçalho, não pela posição", () => {
    // A mesma tabela com as colunas trocadas tem de dar o mesmo resultado: ler
    // por índice é o que parte em silêncio quando a AT insere uma coluna.
    const direto = parseDeclarationRows(
      ["Período", "Data de entrega", "Tipo"],
      [["2026-07", "2026-09-10", "Primeira"]],
    );
    const trocado = parseDeclarationRows(
      ["Tipo", "Data de entrega", "Período"],
      [["Primeira", "2026-09-10", "2026-07"]],
    );
    expect(direto).toEqual(trocado);
    expect(direto).toEqual([
      { period: "2026-07", submittedAt: "2026-09-10", state: "Primeira", replacement: false },
    ]);
  });

  it("aceita as abreviaturas e os acentos do cabeçalho real", () => {
    const rows = parseDeclarationRows(
      ["Per.", "Submissão", "Situação"],
      [["2026-07", "10-09-2026", "Entregue"]],
    );
    expect(rows).toEqual([
      { period: "2026-07", submittedAt: "10-09-2026", state: "Entregue", replacement: false },
    ]);
  });

  it("canoniza o período trimestral", () => {
    const rows = parseDeclarationRows(
      ["Período", "Data", "Estado"],
      [["3.º trimestre de 2026", "2026-11-12", "Entregue"]],
    );
    expect(rows[0]?.period).toBe("2026-Q3");
  });

  it("marca as substituições", () => {
    const rows = parseDeclarationRows(
      ["Período", "Data", "Tipo"],
      [
        ["2026-07", "2026-09-10", "Primeira"],
        ["2026-07", "2026-09-14", "Substituição"],
      ],
    );
    expect(rows.map((row) => row.replacement)).toEqual([false, true]);
  });

  it("ignora as linhas cujo período não se consegue ler", () => {
    // Rodapés de totais e linhas de paginação entram na tabela como tudo o
    // resto. Descartá-las é certo; inventar-lhes um período seria fatal.
    const rows = parseDeclarationRows(
      ["Período", "Data", "Tipo"],
      [["2026-07", "2026-09-10", "Primeira"], ["Total", "", ""], []],
    );
    expect(rows).toHaveLength(1);
  });

  it("uma tabela sem linhas devolve uma lista vazia, sem lançar", () => {
    expect(parseDeclarationRows(["Período", "Data", "Tipo"], [])).toEqual([]);
  });

  it("deixa a data e o estado a nulo quando as colunas não existem", () => {
    expect(parseDeclarationRows(["Período"], [["2026-07"]])).toEqual([
      { period: "2026-07", submittedAt: null, state: null, replacement: false },
    ]);
  });

  it("um cabeçalho sem coluna de período é falha estrutural", () => {
    // Sem período não há nada a fazer com a tabela — e adivinhar a coluna era
    // exatamente o erro silencioso que ler por texto existe para evitar.
    try {
      parseDeclarationRows(["Documento", "Data", "Tipo"], [["x", "y", "z"]]);
      expect.unreachable("devia ter lançado");
    } catch (err) {
      expect(err).toBeInstanceOf(AtIntegrityError);
      const integrity = err as AtIntegrityError;
      expect(integrity.outcome).toBe("at_unexpected_page");
      expect(integrity.message).toBe("tabela de declarações sem coluna de período");
    }
  });
});

function row(over: Partial<DeclarationRow> = {}): DeclarationRow {
  return { period: "2026-07", submittedAt: null, state: null, replacement: false, ...over };
}

describe("pickMostRecentDeclaration", () => {
  it("uma lista vazia não tem declaração nenhuma", () => {
    expect(pickMostRecentDeclaration([])).toBe(null);
  });

  it("escolhe o período maior, mesmo entregue mais cedo", () => {
    const picked = pickMostRecentDeclaration([
      row({ period: "2026-08", submittedAt: "2026-10-01" }),
      row({ period: "2026-07", submittedAt: "2026-12-31" }),
    ]);
    expect(picked?.period).toBe("2026-08");
  });

  it("ordena entre regimes: 2026-07 é mais recente que 2026-Q2", () => {
    const picked = pickMostRecentDeclaration([
      row({ period: "2026-Q2" }),
      row({ period: "2026-07" }),
    ]);
    expect(picked?.period).toBe("2026-07");
  });

  it("no empate de período, a submissão mais recente vence — é a substituição", () => {
    const picked = pickMostRecentDeclaration([
      row({ submittedAt: "2026-09-14", state: "Substituição", replacement: true }),
      row({ submittedAt: "2026-09-10", state: "Primeira" }),
    ]);
    expect(picked?.replacement).toBe(true);
  });

  it("aceita as datas em dd-mm-aaaa e dd/mm/aaaa", () => {
    const picked = pickMostRecentDeclaration([
      row({ submittedAt: "10/09/2026", state: "Primeira" }),
      row({ submittedAt: "14-09-2026", state: "Substituição", replacement: true }),
    ]);
    expect(picked?.state).toBe("Substituição");
  });

  it("sem datas legíveis, a substituição vence à mesma", () => {
    const picked = pickMostRecentDeclaration([
      row({ state: "Substituição", replacement: true }),
      row({ state: "Primeira" }),
    ]);
    expect(picked?.replacement).toBe(true);
  });

  it("uma data ilegível nunca vence uma data legível", () => {
    const picked = pickMostRecentDeclaration([
      row({ submittedAt: "sem data", state: "Ilegível" }),
      row({ submittedAt: "2026-09-10", state: "Primeira" }),
    ]);
    expect(picked?.state).toBe("Primeira");
  });
});
