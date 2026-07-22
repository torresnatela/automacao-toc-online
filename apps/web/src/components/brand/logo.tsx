import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Símbolo da Cliconta: arco em "C" com uma onda interna (o motivo de ondas da
 * marca). Usa currentColor, então herda a cor do container.
 */
function LogoMark({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden {...props}>
      <path
        d="M24 9.2a10 10 0 1 0 0 13.6"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M9.6 17.6c1.5-2 3.2-2 4.7 0 1.5 2 3.2 2 4.7 0"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface LogoProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "onDark" | "onLight";
  showWordmark?: boolean;
  markClassName?: string;
}

/** Logo completo: símbolo + wordmark "Cliconta". */
function Logo({
  variant = "onLight",
  showWordmark = true,
  className,
  markClassName,
  ...props
}: LogoProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2",
        variant === "onDark" ? "text-white" : "text-brand-700",
        className,
      )}
      {...props}
    >
      <LogoMark className={cn("size-7 shrink-0", markClassName)} />
      {showWordmark && (
        <span className="font-display text-xl font-medium tracking-tight">Cliconta</span>
      )}
    </span>
  );
}

export { Logo, LogoMark };
