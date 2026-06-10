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
    <div
      role="radiogroup"
      aria-label="Scan type"
      className="grid grid-cols-3 overflow-hidden rounded-[var(--radius-sm)] border border-rule-strong bg-card"
    >
      {SCAN_TYPES.map((t, i) => {
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
              "flex flex-col items-center gap-1.5 px-2 py-3 text-center transition-colors duration-150 ease-[var(--ease)] outline-none disabled:opacity-50",
              i > 0 && "border-l border-rule",
              active
                ? "bg-brand-tint text-ink"
                : "text-muted hover:bg-surface hover:text-ink"
            )}
          >
            <Icon
              className={cn("size-5", active ? "text-brand" : "text-faint")}
              strokeWidth={1.75}
              aria-hidden
            />
            <span className="text-[13px] font-medium">{t.label}</span>
            <span className="text-[11px] leading-tight text-faint">{t.hint}</span>
          </button>
        );
      })}
    </div>
  );
}
