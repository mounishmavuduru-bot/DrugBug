import * as React from "react";
import { cn } from "@/lib/utils";

// Monograph "data sheet": a white panel on paper, hairline-ruled. No diffuse
// shadow (the border+shadow combo is a vibe-coded tell). Restrained 6px radius.
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border border-rule bg-card",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 border-b border-rule px-4 py-3",
        className
      )}
      {...props}
    />
  );
}

/** Small reference label — like a monograph field name. Not an all-caps marketing kicker. */
export function CardEyebrow({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "label-mono text-[11px] uppercase tracking-[0.14em] text-faint",
        className
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-base font-semibold text-ink", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 py-4 text-sm leading-relaxed", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted leading-relaxed", className)} {...props} />;
}
