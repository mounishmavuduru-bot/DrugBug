"use client";

import { ChevronRight, GitBranch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SourceTag } from "@/components/shared/confidence";
import type { CascadeChain } from "@/components/cascade/cascade-utils";

function riskVariant(risk: number): "danger" | "warning" | "neutral" {
  if (risk >= 0.66) return "danger";
  if (risk >= 0.33) return "warning";
  return "neutral";
}

function riskLabel(risk: number): string {
  if (risk >= 0.66) return "High";
  if (risk >= 0.33) return "Moderate";
  return "Low";
}

/**
 * List of detected 3+ drug cascades. Tapping a row opens the full-chain modal.
 * Each row labels model-predicted vs reference (SourceTag) per PRD §10.2.
 */
export function CascadeList({
  cascades,
  onSelect,
}: {
  cascades: CascadeChain[];
  onSelect: (c: CascadeChain) => void;
}) {
  return (
    <ul className="space-y-2" aria-label="Detected cascades">
      {cascades.map((c, i) => (
        <li key={`${c.drugs.join("+")}-${i}`}>
          <button
            type="button"
            onClick={() => onSelect(c)}
            className="flex w-full items-center gap-3 rounded-[var(--radius)] border border-border bg-elevated p-3 text-left transition-fast hover:border-primary/40 hover:bg-surface"
          >
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-primary">
              <GitBranch className="size-4" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="mono truncate text-sm font-medium text-text">
                {c.drugs.join(" + ")}
              </p>
              <p className="truncate text-xs text-muted">
                {c.dominantMechanism || "Multi-drug cascade"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <SourceTag source={c.source === "model" ? "model" : "kb"} />
              <Badge variant={riskVariant(c.risk)}>{riskLabel(c.risk)} risk</Badge>
              <ChevronRight className="size-4 text-muted" aria-hidden />
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
