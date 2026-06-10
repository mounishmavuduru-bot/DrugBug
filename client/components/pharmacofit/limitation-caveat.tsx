"use client";

import { Info } from "lucide-react";

/**
 * Honest-limitation caveat, always shown on PharmacoFit: consumer SNP arrays
 * miss CYP2D6 copy-number / structural variants and many rare alleles, so
 * results are a screening aid only. Prefers a service-provided caveat string
 * when available, falling back to the mandated copy. Rendered in the earthy
 * "monitor" signal tone — a note to read, not an alarm.
 */
const DEFAULT_CAVEAT =
  "Consumer SNP arrays from 23andMe or AncestryDNA don't capture all pharmacogenetic variation — notably CYP2D6 copy-number and structural variants, plus many rare alleles. Treat these flags as a screening aid. High-stakes decisions still need targeted clinical pharmacogenetic testing.";

export function LimitationCaveat({ caveat }: { caveat?: string }) {
  return (
    <aside className="border-t border-rule pt-3">
      <p className="flex items-center gap-1.5 label-mono text-[11px] uppercase tracking-[0.12em] text-monitor">
        <Info className="size-3.5 shrink-0" aria-hidden />
        Limits of consumer SNP data
      </p>
      <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-muted">
        {caveat?.trim() || DEFAULT_CAVEAT}
      </p>
    </aside>
  );
}
