"use client";

import { useState, type KeyboardEvent } from "react";
import { X, Plus } from "lucide-react";
import { Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Lightweight chip / tag editor used for profile `conditions` and `allergies`
 * (PRD §15). Stores a normalized string[] and lets the user add (Enter / comma)
 * or remove tags. No external dependency — matches the primitive style.
 */
export function TagInput({
  id,
  label,
  values,
  onChange,
  placeholder,
  disabled,
  emptyHint,
}: {
  id: string;
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  emptyHint?: string;
}) {
  const [draft, setDraft] = useState("");

  function commit(raw: string) {
    const tag = raw.trim();
    if (!tag) return;
    // De-dupe case-insensitively; keep first-entered casing.
    const exists = values.some((v) => v.toLowerCase() === tag.toLowerCase());
    if (!exists) onChange([...values, tag]);
    setDraft("");
  }

  function remove(idx: number) {
    onChange(values.filter((_, i) => i !== idx));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && draft === "" && values.length > 0) {
      remove(values.length - 1);
    }
  }

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div
        className={cn(
          "flex flex-wrap items-center gap-1.5 rounded-[var(--radius-sm)] border border-rule-strong bg-card p-2 transition-colors duration-150 ease-[var(--ease)] focus-within:border-brand",
          disabled && "opacity-50"
        )}
      >
        {values.map((tag, i) => (
          <span
            key={`${tag}-${i}`}
            className="label-mono inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-brand-tint px-2 py-0.5 text-xs text-ink"
          >
            {tag}
            <button
              type="button"
              onClick={() => remove(i)}
              disabled={disabled}
              aria-label={`Remove ${tag}`}
              className="rounded-[var(--radius-sm)] text-muted transition-colors duration-150 ease-[var(--ease)] hover:text-danger focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-danger"
            >
              <X className="size-3" strokeWidth={2} />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => commit(draft)}
          placeholder={values.length === 0 ? placeholder : undefined}
          className="min-w-24 flex-1 bg-transparent px-1 text-sm text-ink placeholder:text-faint outline-none disabled:cursor-not-allowed"
          aria-label={label}
        />
      </div>
      <p className="mt-1.5 flex items-center gap-1 text-[11px] text-faint">
        <Plus className="size-3" strokeWidth={1.75} aria-hidden />{" "}
        {emptyHint ?? "Press Enter or comma to add."}
      </p>
    </div>
  );
}
