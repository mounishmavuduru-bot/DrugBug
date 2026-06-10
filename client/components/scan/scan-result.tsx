"use client";

import { useState } from "react";
import { CheckCircle2, ListChecks, Pill, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfidenceBar } from "@/components/shared/confidence";
import { Disclaimer } from "@/components/med/disclaimer";
import { cn } from "@/lib/utils";
import { AuthenticityBreakdown } from "./authenticity-breakdown";
import {
  ID_CONFIDENCE_THRESHOLD,
  parseCandidates,
  type Candidate,
  type Scan,
} from "./scan-utils";

/**
 * Renders a completed scan (PRD §10.1):
 *  - high confidence → asserts a single identity + confidence bar
 *  - low confidence  → NEVER asserts one identity; shows a top-3 candidate list
 *    the user must confirm against imprint/shape/color (the pharmacist method)
 *  - authenticity breakdown with the aggregate verdict
 *  - optional "Add this medication" CTA (intent=add flow)
 */
export function ScanResult({
  scan,
  intentAdd,
  onAdd,
}: {
  scan: Scan;
  intentAdd: boolean;
  /** Called with the confirmed identity (name + ndc) to start the add flow. */
  onAdd?: (chosen: { name: string; ndc: string }) => void;
}) {
  const confidence = scan.idConfidence ?? 0;
  const lowConfidence = confidence < ID_CONFIDENCE_THRESHOLD;
  const candidates: Candidate[] = parseCandidates(scan.rawAnalysis);
  const [chosen, setChosen] = useState<Candidate | null>(null);

  const hasIdentity = Boolean(scan.identifiedDrug) && !lowConfidence;

  return (
    <div className="space-y-5">
      {/* ---- Identification ---- */}
      {hasIdentity ? (
        <Card>
          <CardHeader className="items-center">
            <span className="flex items-center gap-2 text-positive">
              <CheckCircle2 className="size-4" strokeWidth={1.75} aria-hidden />
              <span className="label-mono text-[11px] uppercase tracking-[0.14em]">
                Identified
              </span>
            </span>
            <Badge variant="positive">{confidence ? `${Math.round(confidence * 100)}% match` : "Matched"}</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* The drug name is the one thing that matters on this view. */}
            <div className="flex items-start gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-md)] border border-rule bg-brand-tint text-brand">
                <Pill className="size-5" strokeWidth={1.75} aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="label-mono break-words text-lg font-medium leading-tight text-ink">
                  {scan.identifiedDrug}
                </p>
                {scan.identifiedNdc ? (
                  <p className="label-mono mt-0.5 text-xs text-muted">NDC {scan.identifiedNdc}</p>
                ) : null}
              </div>
            </div>
            <ConfidenceBar value={confidence} label="Identification confidence" />
            {intentAdd && onAdd ? (
              <Button
                variant="primary"
                className="w-full"
                onClick={() => onAdd({ name: scan.identifiedDrug, ndc: scan.identifiedNdc })}
              >
                <Plus className="size-4" aria-hidden /> Add this medication
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        /* ---- Low-confidence: require explicit confirmation ---- */
        <Card>
          <CardHeader>
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-md)] border border-rule bg-[color:var(--color-monitor-tint)] text-caution">
                <ListChecks className="size-5" strokeWidth={1.75} aria-hidden />
              </div>
              <CardTitle className="text-base">Confirm the medication</CardTitle>
            </div>
            <Badge variant="caution">Low confidence</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-relaxed text-muted">
              We can&apos;t name one medication with confidence. Match the imprint, shape, and color
              against the candidates below — the same check a pharmacist runs — and confirm the one
              you have.
            </p>
            <ConfidenceBar value={confidence} label="Top match confidence" />

            {candidates.length > 0 ? (
              <ul className="overflow-hidden rounded-[var(--radius-md)] border border-rule">
                {candidates.map((c, i) => {
                  const selected = chosen?.name === c.name && chosen?.ndc === c.ndc;
                  return (
                    <li key={`${c.name}-${i}`} className="border-b border-rule last:border-b-0">
                      <button
                        type="button"
                        onClick={() => setChosen(c)}
                        aria-pressed={selected}
                        className={cn(
                          "block w-full px-3.5 py-3 text-left outline-none transition-colors duration-150 ease-[var(--ease)]",
                          selected ? "bg-brand-tint" : "bg-card hover:bg-surface"
                        )}
                      >
                        <div className="flex items-baseline gap-2">
                          <span className="label-mono tnum text-[11px] text-faint" aria-hidden>
                            {i + 1}
                          </span>
                          <span className="label-mono min-w-0 flex-1 text-sm text-ink">
                            {c.name}
                          </span>
                          {selected ? (
                            <CheckCircle2
                              className="size-4 shrink-0 text-brand"
                              strokeWidth={1.75}
                              aria-hidden
                            />
                          ) : null}
                        </div>
                        {/* Imprint/shape/color — the spec a pharmacist matches by hand. */}
                        <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 pl-[1.4rem] text-[11px]">
                          <Spec label="NDC" value={c.ndc} mono />
                          <Spec label="Imprint" value={c.imprint} mono />
                          <Spec label="Shape" value={c.shape} />
                          <Spec label="Color" value={c.color} />
                        </dl>
                        {typeof c.confidence === "number" ? (
                          <ConfidenceBar value={c.confidence} label="Match" className="mt-2.5" />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="rounded-[var(--radius-md)] border border-rule bg-surface px-4 py-3 text-xs leading-relaxed text-muted">
                No candidate matches came back. Re-scan in better lighting, or enter the medication
                by hand.
              </div>
            )}

            {intentAdd && onAdd ? (
              <Button
                variant="primary"
                className="w-full"
                disabled={!chosen}
                onClick={() => chosen && onAdd({ name: chosen.name, ndc: chosen.ndc ?? "" })}
              >
                <Plus className="size-4" aria-hidden /> Confirm and add
              </Button>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* ---- Authenticity ---- */}
      <AuthenticityBreakdown verdict={scan.authenticity} authLayersJson={scan.authLayers} />
      <Disclaimer />
    </div>
  );
}

/** One imprint/shape/color spec, label above its value — only renders if present. */
function Spec({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-[9px] uppercase tracking-[0.1em] text-faint">{label}</dt>
      <dd className={cn("text-ink", mono && "label-mono")}>{value}</dd>
    </div>
  );
}
