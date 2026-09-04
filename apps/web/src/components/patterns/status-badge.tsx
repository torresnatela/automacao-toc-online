import * as React from "react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { IVA_ROW_TONES, type IvaRowState } from "@/lib/documents/outcomes";

type StatusKind = "trace" | "company" | "team" | "role" | "job" | "ivaDocument";

type Tone = BadgeProps["tone"];

/**
 * Rótulos PT de `jobs.status`. Vivem aqui, e não na página que primeiro os
 * escreveu, porque a mesma coluna aparece em mais do que um ecrã — duas cópias
 * divergiriam.
 */
export const JOB_LABELS: Record<string, string> = {
  pending: "Na fila",
  running: "A executar",
  succeeded: "Concluída",
  failed: "Falhou",
  skipped: "Ignorada",
  cancelled: "Cancelada",
};

// Mapa (kind, value) → tom semântico. Valores em minúsculas.
const TONES: Record<StatusKind, Record<string, Tone>> = {
  trace: {
    success: "success",
    ok: "success",
    error: "destructive",
    failed: "destructive",
    failure: "destructive",
    running: "info",
    pending: "warning",
    queued: "warning",
  },
  company: { active: "success", inactive: "neutral", suspended: "warning" },
  team: { active: "success", inactive: "neutral" },
  role: { admin: "brand", operator: "accent", viewer: "neutral", leitor: "neutral" },
  job: {
    pending: "warning",
    running: "info",
    succeeded: "success",
    failed: "destructive",
    skipped: "neutral",
    cancelled: "neutral",
  },
  // Os desfechos do Módulo 1 mais os estados de UI, derivados da severidade que
  // o domínio atribui a cada um (ver `lib/documents/outcomes.ts`) — nunca
  // escritos aqui à mão.
  ivaDocument: IVA_ROW_TONES,
};

/** Rótulo por omissão, para os `kind` que têm tradução própria. */
const LABELS: Partial<Record<StatusKind, Record<string, string>>> = { job: JOB_LABELS };

/**
 * `ivaDocument` exige `label` de quem chama: o rótulo do desfecho vem de
 * `rowStateMeta` (que já o foi buscar ao domínio), e deixá-lo cair para o
 * próprio `value` mostraria `at_login_rejected` ao operador.
 */
type StatusBadgeProps = Omit<BadgeProps, "tone" | "children"> &
  (
    | {
        kind: Exclude<StatusKind, "ivaDocument">;
        value: string;
        /** Rótulo a exibir (ex.: PT vindo de lib/labels). Default: o próprio value. */
        label?: React.ReactNode;
      }
    | { kind: "ivaDocument"; value: IvaRowState; label: React.ReactNode }
  );

function StatusBadge({ kind, value, label, ...props }: StatusBadgeProps) {
  const key = value?.toLowerCase?.();
  const tone = TONES[kind]?.[key] ?? "neutral";
  return (
    <Badge tone={tone} {...props}>
      {label ?? LABELS[kind]?.[key] ?? value}
    </Badge>
  );
}

export { StatusBadge };
