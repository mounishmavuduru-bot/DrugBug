"use client";

import { X } from "lucide-react";
import { SeverityBadge } from "@/components/shared/severity";
import { SourceTag, ConfidenceBar } from "@/components/shared/confidence";
import { Disclaimer } from "@/components/med/disclaimer";
import type { CascadePair } from "@/components/cascade/cascade-utils";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label-mono text-[11px] uppercase tracking-[0.14em] text-faint">{label}</dt>
      <dd className="mt-1 text-sm leading-relaxed text-ink">{value}</dd>
    </div>
  );
}

/**
 * Side panel for a tapped interaction edge (PRD §10.2): mechanism, effect,
 * management, source (reference vs model), and confidence for model-predicted
 * findings. Right-side aside on desktop, stacks below the graph on mobile.
 */
export function EdgePanel({ pair, onClose }: { pair: CascadePair; onClose: () => void }) {
  return (
    <aside
      className="flex flex-col gap-4 rounded-[var(--radius-md)] border border-rule bg-surface p-4"
      role="region"
      aria-label="Interaction detail"
    >
      <header className="flex items-start justify-between gap-2 border-b border-rule pb-3">
        <div className="min-w-0">
          <p className="label-mono text-[11px] uppercase tracking-[0.14em] text-faint">
            Interaction
          </p>
          {/* The two drug names stacked — readable even when long, no truncation. */}
          <p className="label-mono mt-1.5 text-sm font-semibold leading-snug text-ink">
            {pair.drugA}
          </p>
          <p className="label-mono text-sm font-semibold leading-snug text-ink">
            <span className="text-faint">+ </span>
            {pair.drugB}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close interaction detail"
          className="-mr-1 -mt-1 shrink-0 rounded-[var(--radius-sm)] p-1 text-muted transition-colors duration-150 ease-[var(--ease)] hover:bg-brand-tint hover:text-ink"
        >
          <X className="size-4" aria-hidden />
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={pair.severity} />
        <SourceTag source={pair.source} />
      </div>

      {pair.source === "model" && typeof pair.confidence === "number" ? (
        <ConfidenceBar value={pair.confidence} label="Model confidence" />
      ) : null}

      {/* Ruled field list — the monograph "Rx" layout: label, then plain answer. */}
      <dl className="space-y-3 border-t border-rule pt-3">
        <Field label="How they interact" value={pair.mechanism || "Not specified."} />
        {pair.effect ? <Field label="What it can do" value={pair.effect} /> : null}
        <Field
          label="What to do"
          value={pair.management || "Ask your pharmacist or prescriber before changing anything."}
        />
      </dl>

      <Disclaimer />
    </aside>
  );
}
