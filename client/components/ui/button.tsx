import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Monograph buttons: confident solids, hairline-ruled secondaries, whisper hovers
// (color shift only — no lift, scale, or glow). Focus ring is global.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors duration-150 ease-[var(--ease)] disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0 select-none",
  {
    variants: {
      variant: {
        primary:
          "rounded-[var(--radius-sm)] bg-brand text-brand-ink hover:bg-brand-hover",
        secondary:
          "rounded-[var(--radius-sm)] border border-rule-strong bg-card text-ink hover:bg-brand-tint hover:border-brand",
        quiet:
          "rounded-[var(--radius-sm)] text-muted hover:bg-brand-tint hover:text-ink",
        danger:
          "rounded-[var(--radius-sm)] bg-danger text-paper hover:brightness-95",
        link:
          "text-brand underline decoration-rule-strong underline-offset-4 hover:decoration-brand p-0 h-auto",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
);
Button.displayName = "Button";

export { buttonVariants };
