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
    <div className="space-y-4">
      {/* ---- Identification ---- */}
      {hasIdentity ? (
        <Card className="space-y-3">
          <CardHeader className="mb-0">
            <div className="flex items-center gap-2">
              <div className="grid size-9 place-items-center rounded-lg bg-primary/15 text-primary">
                <Pill className="size-5" />
              </div>
              <div>
                <CardTitle className="mono text-base">{scan.identifiedDrug}</CardTitle>
                {scan.identifiedNdc ? (
                  <p className="mono text-xs text-muted">NDC {scan.identifiedNdc}</p>
                ) : null}
              </div>
            </div>
            <Badge variant="success">
              <CheckCircle2 className="size-3.5" /> Identified
            </Badge>
          </CardHeader>
          <ConfidenceBar value={confidence} label="Identification confidence" />
          {intentAdd && onAdd ? (
            <Button
              variant="primary"
              className="w-full"
              onClick={() => onAdd({ name: scan.identifiedDrug, ndc: scan.identifiedNdc })}
            >
              <Plus className="size-4" /> Add this medication
            </Button>
          ) : null}
          <Disclaimer />
        </Card>
      ) : (
        /* ---- Low-confidence: require explicit confirmation ---- */
        <Card className="space-y-3 border-warning/40">
          <CardHeader className="mb-0">
            <div className="flex items-center gap-2">
              <div className="grid size-9 place-items-center rounded-lg bg-warning/15 text-warning">
                <ListChecks className="size-5" />
              </div>
              <CardTitle className="text-base">Confirm the medication</CardTitle>
            </div>
            <Badge variant="warning">Low confidence</Badge>
          </CardHeader>
          <CardContent className="text-xs text-muted">
            We can’t assert a single identity confidently. Match the imprint, shape, and color
            against the candidates below — the same method a pharmacist uses — and confirm.
          </CardContent>
          <ConfidenceBar value={confidence} label="Top match confidence" />

          {candidates.length > 0 ? (
            <ul className="space-y-2">
              {candidates.map((c, i) => {
                const selected = chosen?.name === c.name && chosen?.ndc === c.ndc;
                return (
                  <li key={`${c.name}-${i}`}>
                    <button
                      type="button"
                      onClick={() => setChosen(c)}
                      aria-pressed={selected}
                      className={cn(
                        "w-full rounded-[var(--radius)] border p-3 text-left transition-fast outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                        selected
                          ? "border-primary/60 bg-primary/10"
                          : "border-border bg-elevated hover:border-primary/30"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="mono text-sm text-text">{c.name}</span>
                        {selected ? <CheckCircle2 className="size-4 text-primary" /> : null}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
                        {c.ndc ? <span className="mono">NDC {c.ndc}</span> : null}
                        {c.imprint ? <span>Imprint: {c.imprint}</span> : null}
                        {c.shape ? <span>Shape: {c.shape}</span> : null}
                        {c.color ? <span>Color: {c.color}</span> : null}
                      </div>
                      {typeof c.confidence === "number" ? (
                        <ConfidenceBar value={c.confidence} label="Match" className="mt-2" />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Card className="text-xs text-muted">
              No candidate matches were returned. Re-scan in better lighting, or enter the
              medication manually.
            </Card>
          )}

          {intentAdd && onAdd ? (
            <Button
              variant="primary"
              className="w-full"
              disabled={!chosen}
              onClick={() => chosen && onAdd({ name: chosen.name, ndc: chosen.ndc ?? "" })}
            >
              <Plus className="size-4" /> Confirm &amp; add
            </Button>
          ) : null}
          <Disclaimer />
        </Card>
      )}

      {/* ---- Authenticity ---- */}
      <AuthenticityBreakdown verdict={scan.authenticity} authLayersJson={scan.authLayers} />
      <Disclaimer />
    </div>
  );
}
