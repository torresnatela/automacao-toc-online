import type { RawTocCompany } from "@toc/core/domain";

/** De onde a lista foi lida. Sinal precoce de mudança de versão do TOConline. */
export type GridSource = "items" | "polymer_data" | "legacy_items" | "none";

export interface GridProjection {
  rows: RawTocCompany[];
  /** O total que o próprio grid diz ter. Divergir de `rows.length` é truncagem. */
  reportedSize: number | null;
  via: GridSource;
}

/**
 * Lê a lista de empresas de dentro de um `vaadin-grid`.
 *
 * **Esta função corre DENTRO do browser.** O Playwright serializa-a com
 * `toString()` e avalia-a na página, portanto o corpo não pode referir nada do
 * escopo do módulo: sem imports de valor, sem constantes de ficheiro, sem
 * helpers do TypeScript. Só literais e globais do browser. É por isso que vive
 * sozinha neste ficheiro, e há um teste que inspeciona o `toString()` para
 * garantir que o transpilador não injetou nada.
 *
 * Vive num ficheiro próprio por uma segunda razão: assim é uma função pura de
 * objeto→objeto, testável em Node sem browser nenhum.
 *
 * A projeção acontece cá dentro (e não no Node) por causa do `_csHTML`: cada
 * linha traz o markup renderizado, que é pesado e cheio de dados do cliente.
 * Trazê-lo para a memória do worker seria desperdício e risco de acabar num log.
 *
 * Não coage nem valida nada — isso é `normalizeScan`, no domínio. Aqui só se
 * extrai.
 */
export function projectGrid(el: unknown): GridProjection {
  // `unknown` e não `HTMLElement` de propósito: o worker é uma app Node e não
  // carrega a lib DOM do TypeScript — carregá-la só por causa desta assinatura
  // abriria a porta a globais de browser no resto do worker, onde não existem.
  const grid = (el || {}) as Record<string, unknown>;

  let source: unknown[] | null = null;
  let via = "none";

  if (Array.isArray(grid.items)) {
    source = grid.items;
    via = "items";
  } else {
    const data = grid.__data as Record<string, unknown> | undefined;
    if (data && Array.isArray(data.items)) {
      source = data.items;
      via = "polymer_data";
    } else if (Array.isArray(grid._items)) {
      source = grid._items;
      via = "legacy_items";
    }
  }

  // Mesmo sem linhas, o tamanho anunciado é diagnóstico: "dizia 182 e não veio
  // nada" é uma falha diferente de "o grid não existe".
  let reportedSize: number | null = null;
  if (typeof grid.size === "number") reportedSize = grid.size;
  else if (typeof grid._effectiveSize === "number") reportedSize = grid._effectiveSize;

  const rows: RawTocCompany[] = [];
  if (source) {
    for (const raw of source) {
      const row = (raw || {}) as Record<string, unknown>;
      rows.push({
        id: row.id,
        tax_number: row.tax_number,
        name: row.name,
        cluster: row.cluster,
        status: row.status,
        i18n_status: row.i18n_status,
        demo: row.demo,
        accounting: row.accounting,
        roles: row.roles,
      } as RawTocCompany);
    }
  }

  return { rows, reportedSize, via: via as GridSource };
}
