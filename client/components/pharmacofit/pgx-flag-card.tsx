"use client";

import { Dna } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PgxFlag } from "@/lib/inference-client";

/**
 * Maps CPIC strength of evidence to a tone. CPIC levels are A/B (and A/B with
 * "/optional"); higher strength → more emphasis. Unknown/absent levels render
 * neutral so we never over-state certainty.
 */
function cpicVariant(level?: string): "danger" | "warning" | "primary" | "neutral" {
  const l = (level || "").trim().toUpperCase();
  if (l.startsWith("A")) return "danger";
  if (l.startsWith("B")) return "warning";
  if (l) return "primary";
  return "neutral";
}

/**
 * A single per-medication pharmacogenomic flag (PRD §10.4 output). Shows the
 * gene, the called phenotype, the affected medication (mono), the CPIC guidance
 * text, and the CPIC evidence level. Findings are decision-support only.
 */
export function PgxFlagCard({ flag }: { flag: PgxFlag }) {
  return (
    <Card className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="mono text-sm font-semibold text-text">
            {flag.medication}
          </span>
        </div>
        {flag.cpicLevel ? (
          <Badge variant={cpicVariant(flag.cpicLevel)}>
            CPIC {flag.cpicLevel}
          </Badge>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="primary" className="gap-1">
          <Dna className="size-3" /> <span className="mono">{flag.gene}</span>
        </Badge>
        <Badge variant="neutral">{flag.phenotype}</Badge>
      </div>

      <p className="text-sm leading-snug text-text">{flag.guidance}</p>
    </Card>
  );
}
