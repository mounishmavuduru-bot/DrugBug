"use client";

import { ChevronRight, GitBranch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SourceTag } from "@/components/shared/confidence";
import type { CascadeChain } from "@/components/cascade/cascade-utils";

function riskVariant(risk: number): "danger" | "caution" | "neutral" {
  if (risk >= 0.66) return "danger";
  if (risk >= 0.33) return "caution";
  return "neutral";
}

function riskLabel(risk: number): string {
  if (risk >= 0.66) return "High";
  if (risk >= 0.33) return "Moderate";
  return "Low";
}

/**
 * Detected three-drug cascades as a ruled index. Tapping a row opens the
 * full-chain modal. Each row marks model-predicted vs reference (SourceTag) per
 * PRD §10.2.
 */
export function CascadeList({
  cascades,
  onSelect,
}: {
  cascades: CascadeChain[];
  onSelect: (c: CascadeChain) => void;
}) {
  return (
    <ul
      className="divide-y divide-rule rounded-[var(--radius-md)] border border-rule bg-card"
      aria-label="Detected cascades"
    >
      {cascades.map((c, i) => (
        <li key={`${c.drugs.join("+")}-${i}`}>
          <button
            type="button"
            onClick={() => onSelect(c)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 ease-[var(--ease)] hover:bg-brand-tint"
          >
            <GitBranch
              className="size-4 shrink-0 text-brand"
              strokeWidth={1.75}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="label-mono truncate text-sm font-medium text-ink">
                {c.drugs.join(" + ")}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted">
                {c.dominantMechanism || "Three or more medications interacting together"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <SourceTag source={c.source === "model" ? "model" : "kb"} />
              <Badge variant={riskVariant(c.risk)}>{riskLabel(c.risk)} risk</Badge>
              <ChevronRight className="size-4 text-faint" aria-hidden />
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
