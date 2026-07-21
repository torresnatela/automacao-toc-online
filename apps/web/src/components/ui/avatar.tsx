import * as React from "react";
import { cn } from "@/lib/utils";

/** Avatar simples de iniciais (sem imagem) — suficiente para o menu do utilizador. */
function Avatar({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex size-9 select-none items-center justify-center rounded-full bg-brand-100 text-sm font-medium text-brand-700",
        className,
      )}
      {...props}
    />
  );
}

/** Deriva até 2 iniciais de um email ou nome. */
function initialsFrom(value: string): string {
  const base = value.includes("@") ? value.split("@")[0] : value;
  const parts = base.split(/[.\s_-]+/).filter(Boolean);
  const chars = parts.length >= 2 ? parts[0][0] + parts[1][0] : base.slice(0, 2);
  return chars.toUpperCase();
}

export { Avatar, initialsFrom };
