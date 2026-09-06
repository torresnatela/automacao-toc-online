"use client";

import { useActionState } from "react";
import { Download } from "lucide-react";
import { fetchIvaDocumentAction, type FetchState } from "./actions";
import { FORCE_FLAG } from "@/lib/documents/bulk";
import type { FetchAffordance } from "@/lib/documents/present";
import { Button } from "@/components/ui/button";

/**
 * O botão de busca de UMA rota: recebe a decisão dessa rota (`fetchAffordance`)
 * e escreve a rota no formulário. Há um por rota em cada linha — «Buscar» e
 * «Buscar via TOConline» — e cada um responde por si: o seu motivo de estar
 * desligado, o seu `role="status"`.
 */
export interface FetchButtonProps extends FetchAffordance {
  companyId: string;
  teamId: string;
  /** `outline` na rota B (a de sempre), `ghost` na A, que é a que se anuncia. */
  variant?: "outline" | "ghost";
}

export function FetchButton({
  companyId,
  teamId,
  access,
  canFetch,
  disabledReason,
  label,
  refetch,
  variant,
}: FetchButtonProps) {
  const [state, formAction, pending] = useActionState<FetchState, FormData>(
    fetchIvaDocumentAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="teamId" value={teamId} />
      {/* A rota é do botão, não da página: é isto que o servidor lê para saber
          por onde ir buscar. */}
      <input type="hidden" name="access" value={access} />
      {/* Re-busca é sempre forçada. Sem isto o botão «Buscar novamente» seria um
          beco: a guia já está guardada, e o worker fecharia o job como
          `already_fetched` sem sequer abrir o portal — o operador clicaria e
          nada mudaria no ecrã. `refetch` vem explícito de `fetchAffordance`, e
          não do rótulo: um rótulo novo não o pode desligar em silêncio. */}
      {refetch && <input type="hidden" name="force" value={FORCE_FLAG} />}

      <Button
        type="submit"
        size="sm"
        variant={variant ?? "outline"}
        disabled={pending || !canFetch}
        title={disabledReason}
      >
        <Download aria-hidden /> {pending ? "A enfileirar…" : label}
      </Button>

      {/* O `title` não chega a quem usa leitor de ecrã nem a quem navega por
          teclado sem rato — o motivo tem de estar no acessível também. */}
      {disabledReason && <span className="sr-only">{disabledReason}</span>}

      {state.error && (
        <span role="status" className="text-xs text-destructive">
          {state.error}
        </span>
      )}
      {state.ok && (
        <span role="status" className="text-muted-foreground text-xs">
          {state.alreadyRunning
            ? "Já existe uma busca em curso para esta empresa."
            : "Busca enfileirada."}
        </span>
      )}
    </form>
  );
}
