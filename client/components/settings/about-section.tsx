"use client";

import { Info, Scale, Database } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Disclaimer } from "@/components/med/disclaimer";

const APP_VERSION =
  process.env.NEXT_PUBLIC_APP_VERSION || "0.1.0";

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
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
        <Info className="size-3.5" /> About
      </h2>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-text">DrugBug</p>
          <span className="mono text-xs text-muted">v{APP_VERSION}</span>
        </div>

        <div className="flex items-start gap-3 border-t border-border pt-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-elevated text-muted">
            <Scale className="size-4" />
          </div>
          <div>
            <p className="text-sm font-medium text-text">Regulatory &amp; safety</p>
            <p className="mt-1 text-xs leading-snug text-muted">
              DrugBug is decision-support, not a diagnosis. Pill identification,
              counterfeit verdicts, and interaction/cascade analysis are
              image- and model-based functions that may constitute Software as a
              Medical Device; they are confidence-gated, surface uncertainty, and
              must always be confirmed with a pharmacist or prescriber. DrugBug
              makes no diagnostic claims and does not replace professional
              judgement (PRD §16).
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 border-t border-border pt-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-elevated text-muted">
            <Database className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-text">Data sources</p>
            <p className="mt-1 text-xs leading-snug text-muted">
              Safety guidance draws on curated medical reference data. Model and
              dataset versions are pinned and recorded with each result for
              auditability (PRD §13/§18).
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DATA_SOURCES.map((s) => (
                <span
                  key={s}
                  className="rounded bg-elevated px-2 py-0.5 text-[11px] text-muted"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-3">
          <Disclaimer />
        </div>
      </Card>
    </section>
  );
}
