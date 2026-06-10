"use client";

import { BellRing, X } from "lucide-react";
import { clockTime } from "@/lib/format";
import { DecisionSupportNote } from "@/components/today/disclaimer";
import type { DoseWithMed } from "@/components/today/today-utils";

/**
 * Predictive nudge (PRD §9.1/§10.3). When the AdherenceForecaster predicts a
 * pending dose is likely to be missed (pMiss > 0.5), surface a pre-emptive
 * reminder. Shows the model's confidence (the predicted miss probability).
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
    <div className="rounded-[var(--radius)] border border-warning/40 bg-warning/10 p-3">
      <div className="flex items-start gap-2.5">
        <BellRing className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text">
            You may be at risk of missing this dose
          </p>
          <p className="mt-0.5 text-xs text-muted">
            <span className="mono text-text">{medName}</span> at{" "}
            <span className="mono text-text">{clockTime(row.scheduledAt)}</span> —
            predicted miss likelihood{" "}
            <span className="mono text-warning">{pct}%</span>. Set yourself a
            reminder so you don&apos;t skip it.
          </p>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss reminder"
          className="rounded-md p-1 text-muted transition-fast hover:bg-elevated hover:text-text"
        >
          <X className="size-4" />
        </button>
      </div>
      <DecisionSupportNote className="mt-2" />
    </div>
  );
}
