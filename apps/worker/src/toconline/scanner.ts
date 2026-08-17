import type { AuthenticatedTocSession, CompanyScanner } from "../runner/ports";
import { readCompaniesGrid, type GridReadOptions } from "./companies-grid";
import type { GridProjection } from "./project-grid";

/**
 * Liga a sessão autenticada à leitura do grid.
 *
 * É deliberadamente uma linha: separar "quem tem a página" de "quem sabe ler o
 * grid" é o que permite testar a leitura contra uma fixture local, sem sessão
 * nenhuma, e testar o runner sem browser nenhum.
 */
export class TocCompanyScanner implements CompanyScanner {
  constructor(private readonly options: GridReadOptions = {}) {}

  async scan(session: AuthenticatedTocSession): Promise<GridProjection> {
    return readCompaniesGrid(session.page, this.options);
  }
}
