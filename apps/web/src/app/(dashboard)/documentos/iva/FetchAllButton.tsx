"use client";

import { useActionState } from "react";
import { DownloadCloud } from "lucide-react";
import { fetchAllIvaDocumentsAction, type FetchAllState } from "./actions";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export interface FetchAllButtonProps {
  teamId: string;
  disabled?: boolean;
}

/**
 * Versão mínima: enfileira o que falta, sem perguntar.
 *
 * O diálogo de confirmação (e a opção de refazer as já obtidas) é da Task 14 —
 * por isso `onlyMissing` vai fixo em `on`: é o comportamento conservador, e o
 * que evita 182 sessões de browser por engano.
 */
export function FetchAllButton({ teamId, disabled = false }: FetchAllButtonProps) {
  const [state, formAction, pending] = useActionState<FetchAllState, FormData>(
    fetchAllIvaDocumentsAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="onlyMissing" value="on" />

      <Button type="submit" variant="accent" disabled={pending || disabled}>
        <DownloadCloud aria-hidden /> {pending ? "A enfileirar…" : "Buscar todas"}
      </Button>

      {state.error && (
        <Alert variant="destructive" className="max-w-md">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.ok && state.skipped && (
        <Alert variant="success" role="status" className="max-w-md">
          <AlertDescription>
            {state.enqueued} enfileiradas · {state.skipped.alreadyRunning} já em curso ·{" "}
            {state.skipped.notReady} não prontas · {state.skipped.alreadyFetched} já obtidas este
            mês
          </AlertDescription>
        </Alert>
      )}
    </form>
  );
}
