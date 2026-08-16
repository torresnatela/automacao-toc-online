import type { CompanyScan } from "@toc/core/domain";
import { StructuralError } from "../errors";
import type { GridProjection } from "./project-grid";

/**
 * Decide se uma varredura merece confiança.
 *
 * O modo de falha que estas guardas existem para apanhar não é o ruidoso — é o
 * silencioso. Se o TOConline renomear uma propriedade, ou se lermos o grid a
 * meio do stream do WebSocket, o resultado não é um erro: é uma lista **mais
 * curta**, que a persistência aceitaria alegremente. A carteira do gabinete
 * encolheria sem ninguém dar por isso.
 *
 * Por isso todas lançam `StructuralError`: falha alta, sem retry (retentar não
 * conserta um contrato mudado) e com intervenção humana.
 */

/** Abaixo desta fração da varredura anterior, assume-se leitura defeituosa. */
const MIN_RETENTION_RATIO = 0.8;
/** Acima desta fração de linhas problemáticas, assume-se contrato mudado. */
const MAX_PROBLEM_RATIO = 0.5;

export function assertScanIntegrity(
  read: GridProjection,
  scan: CompanyScan,
  previousCount: number,
): void {
  const rows = read.rows.length;

  // 1. Nenhuma das propriedades conhecidas era um array.
  if (read.via === "none") {
    throw new StructuralError(
      "Não foi possível ler a lista de empresas do TOConline: nenhuma das propriedades conhecidas do grid contém dados. O portal mudou.",
    );
  }

  // 2. O grid existe e está vazio. Sessão morta a meio ou WebSocket caído —
  //    nunca "o gabinete não tem clientes".
  if (rows === 0) {
    throw new StructuralError(
      "A lista de empresas do TOConline veio vazia. Tratado como falha: uma conta de contabilista sem empresas não é um resultado esperado.",
    );
  }

  // 3. Truncagem: o próprio grid diz ter mais do que entregou.
  if (read.reportedSize !== null && read.reportedSize !== rows) {
    throw new StructuralError(
      `Leitura truncada da lista de empresas: o TOConline anuncia ${read.reportedSize} e foram lidas ${rows}.`,
    );
  }

  // 4. Encolhimento anómalo. Clientes saem de um gabinete, mas não um quinto de
  //    uma vez — isso é sintoma de leitura parcial, não de negócio.
  if (previousCount > 0) {
    const floor = Math.ceil(previousCount * MIN_RETENTION_RATIO);
    if (rows < floor) {
      throw new StructuralError(
        `A varredura devolveu ${rows} empresas, menos que o mínimo esperado de ${floor} face às ${previousCount} já conhecidas.`,
      );
    }
  }

  // 5. Havia linhas e nenhuma sobreviveu à validação: os campos mudaram de nome.
  if (scan.companies.length === 0) {
    throw new StructuralError(
      `Foram lidas ${rows} linhas mas nenhuma tem os campos esperados. O contrato de dados do TOConline mudou.`,
    );
  }

  // 6. Descartes em massa.
  if (scan.rejected.length > rows * MAX_PROBLEM_RATIO) {
    throw new StructuralError(
      `${scan.rejected.length} de ${rows} linhas foram descartadas por falta de identificador ou nome. O contrato de dados do TOConline mudou.`,
    );
  }

  // 7. Perda de NIF em massa. Um `tax_number` renomeado não descarta linhas —
  //    deixa-as todas sem NIF, e a varredura "teria sucesso" a apagar o NIF de
  //    meia carteira.
  const nifWarnings = scan.warnings.filter((w) => w.reason !== "nif_duplicado").length;
  if (nifWarnings > rows * MAX_PROBLEM_RATIO) {
    throw new StructuralError(
      `${nifWarnings} de ${rows} empresas vieram sem NIF utilizável. O campo do NIF mudou de nome ou formato.`,
    );
  }
}
