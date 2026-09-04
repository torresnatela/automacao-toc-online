import type { SupabaseClient } from "@supabase/supabase-js";
import { AtTransientError, StructuralError } from "../errors";
import type { DocumentStore } from "../runner/ports";

/**
 * Guarda o PDF da guia no bucket privado do Supabase Storage.
 *
 * **Porquê `upsert` e não versionar**: o caminho
 * `<equipa>/<empresa>/<tipo>/<período>.pdf` *é* a chave de idempotência do
 * período — buscar a guia de julho duas vezes tem de deixar um ficheiro, não
 * dois. Um sufixo de versão criaria objetos que a base de dados não vê
 * (`documents.storage_path` guarda um caminho só, e o unique
 * `document_period_type_uq` garante uma linha por período): órfãos que ninguém
 * apaga, num bucket que a RLS deliberadamente torna ilegível a papéis
 * autenticados. Sobrescrever mantém ficheiro e linha a apontar um para o outro.
 *
 * O caminho só leva uuids e o período — nenhum NIF, nome ou segredo — e por
 * isso pode viajar em `documents.storage_path`. Ainda assim não entra nas
 * mensagens de erro: o que se reporta é o código do Storage, curto e nosso.
 */
export class SupabaseDocumentStore implements DocumentStore {
  constructor(
    /**
     * Cliente injetado: quem o constrói (`index.ts`) é que sabe a service role.
     * Este ficheiro nunca lê o ambiente.
     */
    private readonly client: SupabaseClient,
    private readonly bucket = "documents",
  ) {}

  async put(input: {
    teamId: string;
    companyId: string;
    kind: "iva";
    period: string;
    pdf: Buffer;
  }): Promise<{ storagePath: string; bytes: number }> {
    const storagePath = `${input.teamId}/${input.companyId}/${input.kind}/${input.period}.pdf`;

    let error: unknown;
    try {
      ({ error } = await this.client.storage.from(this.bucket).upload(storagePath, input.pdf, {
        contentType: "application/pdf",
        upsert: true,
      }));
    } catch (e) {
      // O storage-js devolve o erro em vez de o lançar quase sempre; um `throw`
      // aqui é rede a falhar antes de haver resposta — transitório por definição.
      error = e;
    }
    if (error !== null && error !== undefined) throw classificar(error);

    return { storagePath, bytes: input.pdf.length };
  }
}

/**
 * Extrai o código HTTP de um erro do storage-js.
 *
 * `StorageApiError` traz `status` (número) e `statusCode` (string); um
 * `StorageUnknownError` (rede, DNS, socket) não traz nenhum — e é justamente a
 * ausência que o distingue de uma recusa do serviço.
 */
function estado(error: unknown): number | undefined {
  const e = error as { status?: unknown; statusCode?: unknown };
  const cru = e.status ?? e.statusCode;
  const n = typeof cru === "string" ? Number(cru) : cru;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

/**
 * A única pergunta que interessa à fila: vale a pena tentar outra vez?
 *
 * Sem código, `0`, ou 5xx: o Storage esteve indisponível, e a próxima tentativa
 * pode correr bem. 4xx é o serviço a dizer "não" com razão (bucket inexistente,
 * policy, MIME ou tamanho recusados) — retentar só repetia o mesmo "não".
 *
 * O `0` está aqui de propósito: é o que o `fetch` do storage-js põe em `status`
 * quando a resposta nunca chegou (DNS, socket cortado, CORS). Sem este ramo
 * caía no `else` e a guia ficava marcada como recusada para sempre por uma
 * falha de rede — o pior desfecho possível, porque o operador não tem nada
 * para corrigir.
 */
function classificar(error: unknown): Error {
  const codigo = estado(error);
  if (codigo === undefined || codigo === 0 || codigo >= 500) {
    return new AtTransientError("persist_failed", "Storage indisponível.");
  }
  return new StructuralError(`Storage recusou o ficheiro: ${codigo}`);
}
