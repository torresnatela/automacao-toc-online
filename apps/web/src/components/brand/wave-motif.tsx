import * as React from "react";
import { cn } from "@/lib/utils";

interface WaveMotifProps extends React.HTMLAttributes<HTMLDivElement> {
  /** id único do <pattern> — passe distinto se houver mais de um na página. */
  patternId?: string;
}

/**
 * Motivo de ondas/tils da Cliconta, repetido como pattern SVG. Decorativo
 * (aria-hidden). Herda a cor via currentColor (default: sage). Server-safe.
 */
function WaveMotif({ className, patternId = "cliconta-waves", ...props }: WaveMotifProps) {
  return (
    <div className={cn("text-sage-400", className)} aria-hidden {...props}>
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 120 120"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <defs>
          <pattern id={patternId} width="24" height="20" patternUnits="userSpaceOnUse">
            <path
              d="M2 12c2.5-4 5.5-4 8 0s5.5 4 8 0"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              fill="none"
            />
          </pattern>
        </defs>
        <rect width="120" height="120" fill={`url(#${patternId})`} />
      </svg>
    </div>
  );
}

export { WaveMotif };
