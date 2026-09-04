"use client";

import { useActionState } from "react";
import { Download } from "lucide-react";
import { fetchIvaDocumentAction, type FetchState } from "./actions";
import { Button } from "@/components/ui/button";

export interface FetchButtonProps {
  companyId: string;
  teamId: string;
  canFetch: boolean;
  /** Porque está desligado — vem de `presentIvaRow`. Ausente quando pode buscar. */
  disabledReason?: string;
  fetchLabel: string;
}

export function FetchButton({
  companyId,
  teamId,
  canFetch,
  disabledReason,
  fetchLabel,
}: FetchButtonProps) {
  const [state, formAction, pending] = useActionState<FetchState, FormData>(
    fetchIvaDocumentAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="teamId" value={teamId} />

      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={pending || !canFetch}
        title={disabledReason}
      >
        <Download aria-hidden /> {pending ? "A enfileirar…" : fetchLabel}
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
