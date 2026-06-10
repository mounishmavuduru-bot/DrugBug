"use client";

import { Scale, Database } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Disclaimer } from "@/components/med/disclaimer";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "0.1.0";

const DATA_SOURCES = [
  "RxNorm (NLM)",
  "openFDA",
  "DailyMed",
  "DDInter 2.0",
  "TWOSIDES",
  "CPIC / PharmGKB",
] as const;

/**
 * About + regulatory posture (PRD §16 summary). States the decision-support
 * framing, the SaMD / "confirm with a professional" disclaimer, and the static
 * data sources behind the safety modules (PRD §13).
 */
export function AboutSection() {
  return (
    <section className="space-y-3" aria-labelledby="about-heading">
      <h2
        id="about-heading"
        className="label-mono px-1 text-[11px] uppercase tracking-[0.14em] text-muted"
      >
        About
      </h2>

      <Card className="space-y-4 p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium text-ink">DrugBug</p>
          <span className="label-mono text-xs text-muted">v{APP_VERSION}</span>
        </div>

        <div className="flex items-start gap-3 border-t border-rule pt-4">
          <Scale className="mt-0.5 size-4 shrink-0 text-muted" strokeWidth={1.75} aria-hidden />
          <div>
            <p className="text-sm font-medium text-ink">Regulatory and safety</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              DrugBug is decision support, not a diagnosis. Pill identification,
              counterfeit verdicts, and interaction analysis are image- and
              model-based functions that may count as Software as a Medical Device.
              They are gated on confidence, show their uncertainty, and should be
              confirmed with a pharmacist or prescriber. DrugBug makes no diagnostic
              claims (PRD §16).
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 border-t border-rule pt-4">
          <Database className="mt-0.5 size-4 shrink-0 text-muted" strokeWidth={1.75} aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">Data sources</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Safety guidance draws on curated medical reference data. The model and
              dataset versions are pinned and recorded with each result so you can
              audit it (PRD §13/§18).
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DATA_SOURCES.map((s) => (
                <span
                  key={s}
                  className="label-mono rounded-[var(--radius-sm)] border border-rule bg-surface px-2 py-0.5 text-[11px] text-muted"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-rule pt-4">
          <Disclaimer />
        </div>
      </Card>
    </section>
  );
}
