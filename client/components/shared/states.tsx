import * as React from "react";
import { Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Every screen has loading, empty, and error states (PRD §18). */

export function LoadingState({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 py-16 text-muted", className)}>
      <Loader2 className="size-6 animate-spin text-primary" />
      <p className="text-sm">{label}</p>
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
    <div className={cn("flex flex-col items-center justify-center gap-3 py-16 text-center", className)}>
      {Icon ? (
        <div className="grid size-12 place-items-center rounded-full bg-elevated text-muted">
          <Icon className="size-6" />
        </div>
      ) : null}
      <div>
        <p className="text-sm font-medium text-text">{title}</p>
        {description ? <p className="mt-1 max-w-xs text-xs text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
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
    <div className={cn("flex flex-col items-center justify-center gap-3 py-16 text-center", className)}>
      <p className="text-sm font-medium text-danger">{title}</p>
      {description ? <p className="max-w-xs text-xs text-muted">{description}</p> : null}
      {retry ? (
        <button onClick={retry} className="text-xs text-primary underline-offset-2 hover:underline">
          Try again
        </button>
      ) : null}
    </div>
  );
}
