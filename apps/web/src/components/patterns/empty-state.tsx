import * as React from "react";
import { cn } from "@/lib/utils";
import { WaveMotif } from "@/components/brand/wave-motif";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center",
        className,
      )}
    >
      <WaveMotif className="pointer-events-none absolute inset-0 opacity-40" />
      <div className="relative mx-auto flex max-w-sm flex-col items-center gap-3">
        {icon && (
          <div className="flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 [&_svg]:size-6">
            {icon}
          </div>
        )}
        <h3 className="font-display text-lg font-medium">{title}</h3>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}

export { EmptyState };
