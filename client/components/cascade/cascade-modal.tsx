"use client";

import { ArrowRight, Stethoscope } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { SourceTag, ConfidenceBar } from "@/components/shared/confidence";
import { Disclaimer } from "@/components/med/disclaimer";
import type { CascadeChain } from "@/components/cascade/cascade-utils";

function riskVariant(risk: number): "danger" | "warning" | "neutral" {
  if (risk >= 0.66) return "danger";
  if (risk >= 0.33) return "warning";
  return "neutral";
}

function riskLabel(risk: number): string {
  if (risk >= 0.66) return "High risk";
  if (risk >= 0.33) return "Moderate risk";
  return "Low risk";
}

/**
 * Full cascade explanation (PRD §10.2): the drug chain, shared/dominant
 * mechanism, aggregate risk, and a "raise with prescriber" note. Model-predicted
 * vs reference is labeled via SourceTag; confidence shown where available.
 */
export function CascadeModal({
  cascade,
  open,
  onClose,
}: {
  cascade: CascadeChain | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!cascade) return null;
  // Mechanistic-overlay findings are reference-derived; model findings are predicted.
  const tagSource: "kb" | "model" = cascade.source === "model" ? "model" : "kb";

  return (
    <Modal open={open} onClose={onClose} title="Multi-drug cascade">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={riskVariant(cascade.risk)}>{riskLabel(cascade.risk)}</Badge>
          <SourceTag source={tagSource} />
          {cascade.source === "mechanistic" ? (
            <span className="text-[11px] text-muted">mechanistic overlay</span>
          ) : null}
        </div>

        {/* Drug chain */}
        <div className="rounded-[var(--radius)] border border-border bg-elevated p-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">
            Drug chain ({cascade.drugs.length})
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {cascade.drugs.map((d, i) => (
              <span key={`${d}-${i}`} className="flex items-center gap-1.5">
                <span className="mono rounded bg-surface px-2 py-1 text-xs text-text">{d}</span>
                {i < cascade.drugs.length - 1 ? (
                  <ArrowRight className="size-3 shrink-0 text-muted" aria-hidden />
                ) : null}
              </span>
            ))}
          </div>
        </div>

        {/* Aggregate cascade risk with calibrated value (PRD §18). */}
        <ConfidenceBar
          value={typeof cascade.confidence === "number" ? cascade.confidence : cascade.risk}
          label={typeof cascade.confidence === "number" ? "Model confidence" : "Aggregate risk"}
        />

        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Shared / dominant mechanism
          </p>
          <p className="mt-0.5 text-sm leading-snug text-text">
            {cascade.dominantMechanism || "Not specified."}
          </p>
        </div>

        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Chain explanation
          </p>
          <p className="mt-0.5 text-sm leading-snug text-text">
            {cascade.explanation || "No detailed explanation available for this cascade."}
          </p>
        </div>

        <div className="flex items-start gap-2 rounded-[var(--radius)] border border-primary/30 bg-primary/10 p-3">
          <Stethoscope className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <p className="text-xs leading-snug text-text">
            Raise this combination with your prescriber. Cascades involving 3+ drugs may not appear
            in standard pairwise interaction checks.
          </p>
        </div>

        <Disclaimer />
      </div>
    </Modal>
  );
}
