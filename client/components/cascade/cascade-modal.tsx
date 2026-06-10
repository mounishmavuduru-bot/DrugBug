"use client";

import { ArrowRight, Stethoscope } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { SourceTag, ConfidenceBar } from "@/components/shared/confidence";
import { Disclaimer } from "@/components/med/disclaimer";
import type { CascadeChain } from "@/components/cascade/cascade-utils";

function riskVariant(risk: number): "danger" | "caution" | "neutral" {
  if (risk >= 0.66) return "danger";
  if (risk >= 0.33) return "caution";
  return "neutral";
}

function riskLabel(risk: number): string {
  if (risk >= 0.66) return "High risk";
  if (risk >= 0.33) return "Moderate risk";
  return "Low risk";
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="label-mono text-[11px] uppercase tracking-[0.14em] text-faint">
      {children}
    </p>
  );
}

/**
 * Full cascade explanation (PRD §10.2): the drug chain, shared/dominant
 * mechanism, aggregate risk, and a note to raise it with the prescriber.
 * Model-predicted vs reference is marked via SourceTag; confidence shown where
 * available.
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
    <Modal open={open} onClose={onClose} title="Three-drug cascade">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={riskVariant(cascade.risk)}>{riskLabel(cascade.risk)}</Badge>
          <SourceTag source={tagSource} />
          {cascade.source === "mechanistic" ? (
            <span className="text-[11px] text-muted">flagged by mechanism</span>
          ) : null}
        </div>

        {/* Drug chain */}
        <div className="rounded-[var(--radius-md)] border border-rule bg-surface p-3">
          <FieldLabel>The chain ({cascade.drugs.length} medications)</FieldLabel>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {cascade.drugs.map((d, i) => (
              <span key={`${d}-${i}`} className="flex items-center gap-1.5">
                <span className="label-mono rounded-[var(--radius-sm)] border border-rule bg-card px-2 py-1 text-xs text-ink">
                  {d}
                </span>
                {i < cascade.drugs.length - 1 ? (
                  <ArrowRight className="size-3 shrink-0 text-faint" aria-hidden />
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
          <FieldLabel>Shared mechanism</FieldLabel>
          <p className="mt-1 text-sm leading-relaxed text-ink">
            {cascade.dominantMechanism || "Not specified."}
          </p>
        </div>

        <div>
          <FieldLabel>Why these combine</FieldLabel>
          <p className="mt-1 text-sm leading-relaxed text-ink">
            {cascade.explanation || "No detailed explanation is available for this cascade."}
          </p>
        </div>

        <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-rule bg-brand-tint p-3">
          <Stethoscope className="mt-0.5 size-4 shrink-0 text-brand" strokeWidth={1.75} aria-hidden />
          <p className="text-sm leading-relaxed text-ink">
            Raise this combination with your prescriber. Three-drug cascades often
            don&apos;t show up in the standard pair-by-pair interaction checks a
            pharmacy runs.
          </p>
        </div>

        <Disclaimer />
      </div>
    </Modal>
  );
}
