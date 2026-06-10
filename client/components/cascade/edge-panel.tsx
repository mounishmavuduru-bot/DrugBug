"use client";

import { X } from "lucide-react";
import { SeverityBadge } from "@/components/shared/severity";
import { SourceTag, ConfidenceBar } from "@/components/shared/confidence";
import { Disclaimer } from "@/components/med/disclaimer";
import type { CascadePair } from "@/components/cascade/cascade-utils";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 text-sm leading-snug text-text">{value}</p>
    </div>
  );
}

/**
 * Side panel for a tapped interaction edge (PRD §10.2): mechanism, effect,
 * management, source (KB vs model), and confidence for model-predicted findings.
 * Renders as a right-side aside on desktop and a bottom sheet on mobile.
 */
export function EdgePanel({ pair, onClose }: { pair: CascadePair; onClose: () => void }) {
  return (
    <aside
      className="surface flex flex-col gap-4 rounded-[var(--radius)] border border-border p-4"
      role="region"
      aria-label="Interaction detail"
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted">Interaction</p>
          <p className="mono text-sm font-semibold leading-tight text-text">
            {pair.drugA} <span className="text-muted">+</span> {pair.drugB}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close interaction detail"
          className="rounded-md p-1 text-muted transition-fast hover:bg-elevated hover:text-text"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={pair.severity} />
        <SourceTag source={pair.source} />
      </div>

      {pair.source === "model" && typeof pair.confidence === "number" ? (
        <ConfidenceBar value={pair.confidence} label="Model confidence" />
      ) : null}

      <div className="space-y-3">
        <Field label="Mechanism" value={pair.mechanism || "Not specified."} />
        {pair.effect ? <Field label="Effect" value={pair.effect} /> : null}
        <Field label="Management" value={pair.management || "Discuss with your pharmacist or prescriber."} />
      </div>

      <Disclaimer />
    </aside>
  );
}
