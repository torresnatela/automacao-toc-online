import { batchProgress } from "@/lib/documents/present";
import type { IvaDocumentRow } from "@/lib/documents/present";

/**
 * O progresso do «buscar todas» que está a decorrer.
 *
 * Server Component: os números saem das mesmas linhas que a tabela já leu — não
 * há segundo pedido, e nunca se pode dar o caso de a barra dizer uma coisa e a
 * tabela outra. Quem o mantém fresco é o `AutoRefresh` da página, que corre
 * exatamente enquanto houver linhas em curso.
 *
 * `aria-live="polite"`: o texto muda sozinho de 5 em 5 segundos e quem usa
 * leitor de ecrã tem de ouvir o lote a avançar sem ter de ir à procura; polite
 * e não assertive porque não interrompe nada — é um contador.
 */
export function BatchProgress({ rows }: { rows: readonly IvaDocumentRow[] }) {
  const progress = batchProgress(rows);
  if (progress === null) return null;

  return (
    <p
      aria-live="polite"
      className="text-muted-foreground mb-4 rounded-lg border border-border bg-muted/40 px-4 py-2 text-sm"
    >
      Lote em curso: {progress.queued} na fila · {progress.running} a executar · {progress.done}{" "}
      concluídas · {progress.attention} precisam de atenção
    </p>
  );
}
