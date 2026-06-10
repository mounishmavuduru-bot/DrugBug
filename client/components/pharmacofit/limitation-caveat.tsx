"use client";

import { Info } from "lucide-react";

/**
 * Honest-limitation caveat, always shown on PharmacoFit (PRD §10.4): consumer
 * SNP arrays miss CYP2D6 copy-number / structural variants and many rare
 * alleles, so results are a screening aid only. Prefers a service-provided
 * caveat string when available, falling back to the mandated copy.
 */
const DEFAULT_CAVEAT =
  "Consumer SNP arrays (23andMe / AncestryDNA) do not capture all pharmacogenetic variation — notably CYP2D6 copy-number / structural variants and many rare alleles. These results are a screening aid only; definitive pharmacogenetic typing for high-stakes decisions requires a targeted clinical assay.";

export function LimitationCaveat({ caveat }: { caveat?: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-warning/30 bg-warning/10 p-3">
      <div className="flex items-start gap-2">
        <Info className="mt-px size-3.5 shrink-0 text-warning" aria-hidden />
        <div>
          <p className="text-xs font-medium text-warning">Important limitation</p>
          <p className="mt-1 text-[11px] leading-snug text-muted">
            {caveat?.trim() || DEFAULT_CAVEAT}
          </p>
        </div>
      </div>
    </div>
  );
}
