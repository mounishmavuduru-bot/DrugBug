import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Status chips. The pill radius is intentional here — it's a medication app.
// Tinted, restrained, used for state (taken/missed/severity), never decoration.
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-2.5 py-0.5 text-xs font-medium leading-5",
  {
    variants: {
      variant: {
        neutral: "bg-brand-tint text-muted",
        brand: "bg-brand text-brand-ink",
        positive: "bg-positive-tint text-positive",
        monitor: "bg-monitor-tint text-monitor",
        caution: "bg-[color:var(--color-monitor-tint)] text-caution",
        danger: "bg-danger-tint text-danger",
        outline: "border border-rule-strong text-muted",
      },
    },
    defaultVariants: { variant: "neutral" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
