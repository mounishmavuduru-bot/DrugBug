"use client";

import { Pill, Package, ScanBarcode, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SCAN_TYPES, type ScanType } from "./scan-utils";

const ICONS: Record<ScanType, LucideIcon> = {
  bottle: Package,
  pill: Pill,
  barcode: ScanBarcode,
};

/** Segmented selector for the scan mode (bottle | pill | barcode), PRD §10.1. */
export function ScanTypeSelector({
  value,
  onChange,
  disabled,
}: {
  value: ScanType;
  onChange: (t: ScanType) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Scan type" className="grid grid-cols-3 gap-2">
      {SCAN_TYPES.map((t) => {
        const Icon = ICONS[t.value];
        const active = value === t.value;
        return (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(t.value)}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-[var(--radius)] border p-3 text-center transition-fast outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50",
              active
                ? "border-primary/60 bg-primary/10 text-text"
                : "border-border bg-surface text-muted hover:border-primary/30 hover:text-text"
            )}
          >
            <Icon className={cn("size-5", active && "text-primary")} />
            <span className="text-sm font-medium">{t.label}</span>
            <span className="text-[11px] leading-tight text-muted">{t.hint}</span>
          </button>
        );
      })}
    </div>
  );
}
