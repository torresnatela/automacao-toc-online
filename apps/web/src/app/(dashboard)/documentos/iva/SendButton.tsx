"use client";

import { useActionState } from "react";
import { Mail, MailCheck } from "lucide-react";
import { sendIvaDocumentAction, type SendState } from "./actions";
import { Button } from "@/components/ui/button";

/**
 * «Enviar ao cliente» — mock do passo seguinte (envio por email).
 *
 * Só aparece quando há guia capturada por enviar (`canSend`). Ao clicar, o
 * servidor marca a guia como enviada e a confirmação diz, com todas as letras,
 * que o email é **simulado** — para não dar a ideia numa apresentação de que já
 * saiu um email a sério. Quando a guia já foi enviada (`sent`), mostra-se o
 * estado «Enviada», sem botão.
 */
export interface SendButtonProps {
  documentId: string;
  teamId: string;
  canSend: boolean;
  sent: boolean;
}

export function SendButton({ documentId, teamId, canSend, sent }: SendButtonProps) {
  const [state, formAction, pending] = useActionState<SendState, FormData>(
    sendIvaDocumentAction,
    {},
  );

  // Já enviada (na BD, ou agora nesta sessão): estado, não ação.
  if (sent || state.ok) {
    return (
      <span className="text-success inline-flex items-center gap-1 text-xs" role="status">
        <MailCheck aria-hidden className="size-4" /> Enviada por email (simulado)
      </span>
    );
  }

  if (!canSend) return null;

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="documentId" value={documentId} />
      <input type="hidden" name="teamId" value={teamId} />
      <Button type="submit" size="sm" variant="accent" disabled={pending}>
        <Mail aria-hidden /> {pending ? "A enviar…" : "Enviar ao cliente"}
      </Button>
      {state.error && (
        <span role="status" className="text-destructive text-xs">
          {state.error}
        </span>
      )}
    </form>
  );
}
