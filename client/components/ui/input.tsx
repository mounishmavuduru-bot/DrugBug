import * as React from "react";
import { cn } from "@/lib/utils";

// Monograph form fields: card-white on paper, hairline rule, brand focus border.
// Sharp 3px radius like a form on a clinical sheet.
const fieldBase =
  "w-full rounded-[var(--radius-sm)] border border-rule-strong bg-card px-3 text-sm text-ink placeholder:text-faint outline-none transition-colors duration-150 ease-[var(--ease)] focus:border-brand disabled:opacity-50";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(fieldBase, "h-10", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(fieldBase, "min-h-20 py-2 leading-relaxed", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn(fieldBase, "h-10 appearance-none pr-8", className)} {...props} />
));
Select.displayName = "Select";

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "mb-1.5 block text-xs font-medium uppercase tracking-[0.1em] text-muted",
        className
      )}
      {...props}
    />
  );
}
