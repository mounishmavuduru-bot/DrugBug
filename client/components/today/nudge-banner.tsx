"use client";

import { BellRing, X } from "lucide-react";
import { clockTime } from "@/lib/format";
import { DecisionSupportNote } from "@/components/today/disclaimer";
import type { DoseWithMed } from "@/components/today/today-utils";

/**
 * Predictive nudge (PRD §9.1/§10.3). When the AdherenceForecaster predicts a
 * pending dose is likely to be missed (pMiss > 0.5), surface a pre-emptive
 * reminder as a quiet ruled banner. Shows the model's predicted miss likelihood.
 */
export function NudgeBanner({
  row,
  pMiss,
  onDismiss,
}: {
  row: DoseWithMed;
  pMiss: number;
  onDismiss: () => void;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, pMiss)) * 100);
  const medName = row.med?.name ?? "your next dose";

  return (
    <div className="border-y border-rule-strong bg-monitor-tint/40 px-4 py-3">
      <div className="flex items-start gap-3">
        <BellRing className="mt-0.5 size-4 shrink-0 text-monitor" strokeWidth={1.75} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-2 text-sm font-medium text-ink">
            Easy one to forget
            <span className="label-mono tnum text-xs font-normal text-monitor">
              ~{pct}% miss
            </span>
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Your recent pattern says{" "}
            <span className="label-mono text-ink">{medName}</span> at{" "}
            <span className="label-mono text-ink">{clockTime(row.scheduledAt)}</span>{" "}
            often slips. A reminder now would help.
          </p>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss reminder"
          className="rounded-[var(--radius-sm)] p-1 text-muted transition-colors duration-150 ease-[var(--ease)] hover:bg-brand-tint hover:text-ink"
        >
          <X className="size-4" strokeWidth={1.75} aria-hidden />
        </button>
      </div>
      <DecisionSupportNote className="mt-2 pl-7" />
    </div>
  );
}
