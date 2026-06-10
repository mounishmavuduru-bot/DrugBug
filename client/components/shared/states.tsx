import * as React from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/* Loading / empty / error — every data view needs all three (anti-vibe rule 8).
   Loading uses skeletons that match the final layout, never a lone spinner. */

/** Skeleton bars matching a list/timeline layout. */
export function LoadingState({
  rows = 4,
  label = "Loading…",
  className,
}: {
  rows?: number;
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)} aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-[var(--radius-md)] border border-rule bg-card px-4 py-3.5">
          <div className="h-7 w-7 shrink-0 animate-pulse rounded-[var(--radius-sm)] bg-rule" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-1/3 animate-pulse rounded-[var(--radius-sm)] bg-rule" />
            <div className="h-2.5 w-1/4 animate-pulse rounded-[var(--radius-sm)] bg-rule/70" />
          </div>
          <div className="h-5 w-14 animate-pulse rounded-[var(--radius-pill)] bg-rule" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-3 rounded-[var(--radius-md)] border border-dashed border-rule-strong bg-surface px-5 py-8",
        className
      )}
    >
      {Icon ? <Icon className="size-5 text-faint" strokeWidth={1.75} /> : null}
      <div>
        <p className="font-display text-lg text-ink">{title}</p>
        {description ? <p className="mt-1 max-w-md text-sm text-muted leading-relaxed">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  title = "Couldn't load this",
  description,
  retry,
  className,
}: {
  title?: string;
  description?: string;
  retry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-2 rounded-[var(--radius-md)] border border-rule bg-danger-tint px-5 py-5",
        className
      )}
      role="alert"
    >
      <p className="font-medium text-danger">{title}</p>
      {description ? <p className="max-w-md text-sm text-muted leading-relaxed">{description}</p> : null}
      {retry ? (
        <button
          onClick={retry}
          className="mt-1 text-sm font-medium text-brand underline decoration-rule-strong underline-offset-4 hover:decoration-brand"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
