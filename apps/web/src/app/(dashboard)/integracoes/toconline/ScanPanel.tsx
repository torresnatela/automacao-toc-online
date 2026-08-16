"use client";

import { useActionState } from "react";
import { RefreshCw } from "lucide-react";
import { startCompanyScanAction, type ScanFormState } from "./actions";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export interface ScanPanelProps {
  teamId: string;
  disabled: boolean;
  disabledReason?: string;
}

export function ScanPanel({ teamId, disabled, disabledReason }: ScanPanelProps) {
  const [state, formAction, pending] = useActionState<ScanFormState, FormData>(
    startCompanyScanAction,
    {},
  );

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="teamId" value={teamId} />
      <div>
        <Button type="submit" disabled={pending || disabled}>
          <RefreshCw aria-hidden /> {pending ? "A enfileirar..." : "Varredura de empresas"}
        </Button>
      </div>

      {disabled && disabledReason && (
        <p className="text-muted-foreground text-sm">{disabledReason}</p>
      )}

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.ok && (
        <Alert variant="success" role="status">
          <AlertDescription>
            {state.alreadyRunning
              ? "Já existe uma varredura em curso — a acompanhar essa."
              : "Varredura enfileirada. O worker vai processá-la."}
          </AlertDescription>
        </Alert>
      )}
    </form>
  );
}
