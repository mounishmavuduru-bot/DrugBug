"use client";

import { Badge } from "@/components/ui/badge";
import type { PgxFlag } from "@/lib/inference-client";

/**
 * Maps CPIC strength of evidence to a signal tone. CPIC levels are A/B (and A/B
 * with "/optional"); higher strength → more emphasis. Unknown/absent levels
 * render neutral so we never over-state certainty.
 */
function cpicVariant(level?: string): "danger" | "caution" | "brand" | "neutral" {
  const l = (level || "").trim().toUpperCase();
  if (l.startsWith("A")) return "danger";
  if (l.startsWith("B")) return "caution";
  if (l) return "brand";
  return "neutral";
}

/**
 * A single per-medication pharmacogenomic flag, rendered as one ruled monograph
 * entry (the parent stacks these with hairline dividers). Shows the gene and
 * called phenotype in label-mono, the affected medication in label-mono, the
 * CPIC guidance text, and the CPIC evidence level. Findings are decision-support
 * only — the page carries the disclaimer and the limitation caveat.
 */
export function PgxFlagEntry({ flag }: { flag: PgxFlag }) {
  return (
    <article className="px-4 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="label-mono text-sm font-semibold text-ink">
          {flag.medication}
        </h3>
        {flag.cpicLevel ? (
          <Badge variant={cpicVariant(flag.cpicLevel)} className="shrink-0">
            CPIC level {flag.cpicLevel}
          </Badge>
        ) : null}
      </div>

      {/* The gene → phenotype call, set like a line from a reference table. */}
      <p className="mt-1.5 label-mono text-xs text-muted">
        <span className="text-ink">{flag.gene}</span>
        <span className="px-1.5 text-faint" aria-hidden>
          →
        </span>
        <span className="text-ink">{flag.phenotype}</span>
      </p>

      <p className="mt-2.5 max-w-prose text-sm leading-relaxed text-ink">
        {flag.guidance}
      </p>
    </article>
  );
}
