import * as React from "react";
import { Badge, type BadgeProps } from "@/components/ui/badge";

type StatusKind = "trace" | "company" | "team" | "role";

type Tone = BadgeProps["tone"];

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
};

interface StatusBadgeProps extends Omit<BadgeProps, "tone" | "children"> {
  kind: StatusKind;
  value: string;
  /** Rótulo a exibir (ex.: PT vindo de lib/labels). Default: o próprio value. */
  label?: React.ReactNode;
}

function StatusBadge({ kind, value, label, ...props }: StatusBadgeProps) {
  const tone = TONES[kind]?.[value?.toLowerCase?.()] ?? "neutral";
  return (
    <Badge tone={tone} {...props}>
      {label ?? value}
    </Badge>
  );
}

export { StatusBadge };
