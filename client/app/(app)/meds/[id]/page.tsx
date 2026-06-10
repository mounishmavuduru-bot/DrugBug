"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  ClipboardList,
  Dna,
  Loader2,
  Network,
  PauseCircle,
  Pencil,
  Pill,
  PlusCircle,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import { useReducer } from "spacetimedb/react";

import { reducers, identityHex } from "@/lib/db";
import {
  useMyIdentity,
  useMyMeds,
  useDoses,
  useScans,
  useSideEffects,
  useInteractions,
  useRecalls,
} from "@/lib/hooks";
import { tsToDate, clockTime, dayLabel, relativeTo } from "@/lib/format";
import { getPgxFlags, type PgxFlag, type PairFinding, type CascadeFinding } from "@/lib/inference-client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingState, EmptyState, ErrorState } from "@/components/shared/states";
import { SeverityBadge } from "@/components/shared/severity";
import { SourceTag, ConfidenceBar } from "@/components/shared/confidence";
import { Disclaimer } from "@/components/med/disclaimer";
import { EditMedModal } from "@/components/med/edit-med-modal";
import { LogSideEffectModal } from "@/components/med/log-side-effect-modal";
import {
  scheduleSummary,
  lastTaken,
  adherence7d,
  adherenceVariant,
  refillStatus,
  WEEKDAYS,
  type Medication,
} from "@/components/med/med-utils";
import { cn } from "@/lib/utils";

const authVariant: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  verified: "success",
  inconclusive: "warning",
  suspect: "danger",
};

export default function MedDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const me = useMyIdentity();

  const { meds, ready: medsReady } = useMyMeds();
  const { doses, ready: dosesReady } = useDoses();
  const { scans } = useScans();
  const { sideEffects } = useSideEffects();
  const { cache } = useInteractions();
  const { recalls } = useRecalls();

  const deactivateMedication = useReducer(reducers.deactivateMedication);

  const [editOpen, setEditOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const medId = useMemo(() => {
    try {
      return BigInt(id);
    } catch {
      return null;
    }
  }, [id]);

  const med: Medication | undefined = useMemo(
    () => (medId === null ? undefined : meds.find((m) => m.medId === medId)),
    [meds, medId]
  );

  // PGx flags are best-effort (PRD §10.4) — matched to this med by name.
  const [pgxFlags, setPgxFlags] = useState<PgxFlag[] | null>(null);
  const [pgxCaveat, setPgxCaveat] = useState<string>("");
  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    getPgxFlags(identityHex(me))
      .then((res) => {
        if (!cancelled) {
          setPgxFlags(res.flags);
          setPgxCaveat(res.caveat);
        }
      })
      .catch(() => {
        if (!cancelled) setPgxFlags([]);
      });
    return () => {
      cancelled = true;
    };
  }, [me]);

  // ---- loading / not-found ----
  if (medId === null) {
    return <ErrorState title="Invalid medication" description="That medication link is malformed." />;
  }
  if (!medsReady) {
    return <LoadingState label="Loading medication…" />;
  }
  if (!med) {
    return (
      <EmptyState
        icon={Pill}
        title="Medication not found"
        description="It may have been removed."
        action={
          <Link href="/meds" className={buttonVariants({ variant: "secondary" })}>
            Back to medications
          </Link>
        }
      />
    );
  }

  const last = lastTaken(doses, med.medId);
  const adh = adherence7d(doses, med.medId);
  const refill = refillStatus(med);
  const refillOn = tsToDate(med.refillDate);

  // Interaction findings involving this med (parsed from the cache JSON).
  const myPairs = parsePairs(cache?.pairs).filter((p) => mentions(p.drugA, p.drugB, med));
  const myCascades = parseCascades(cache?.cascades).filter((c) =>
    c.drugs.some((d) => nameMatch(d, med))
  );

  // Latest scan for this med (by NDC match or last_scan_id linkage).
  const medScan = scans.find(
    (s) =>
      (med.ndc && s.identifiedNdc && s.identifiedNdc === med.ndc) ||
      (med.lastScanId !== BigInt(0) && s.scanId === med.lastScanId) ||
      (s.identifiedDrug && nameMatch(s.identifiedDrug, med))
  );

  const medSideEffects = sideEffects
    .filter((e) => e.medId === med.medId)
    .sort((a, b) => (tsToDate(b.loggedAt)?.getTime() ?? 0) - (tsToDate(a.loggedAt)?.getTime() ?? 0));

  const medRecalls = recalls.filter((r) => r.medId === med.medId && !r.acknowledged);

  const matchedPgx = (pgxFlags ?? []).filter((f) => nameMatch(f.medication, med));

  const days = Array.from(med.scheduleDays);
  const scheduledDays =
    med.prn || days.length === 0 || days.length === 7
      ? med.prn
        ? "As needed"
        : "Every day"
      : days
          .slice()
          .sort((a, b) => a - b)
          .map((d) => WEEKDAYS[d] ?? d)
          .join(", ");

  const handleDeactivate = async () => {
    setDeactivating(true);
    setActionError(null);
    try {
      await deactivateMedication({ medId: med.medId });
      router.push("/meds");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to deactivate.");
      setDeactivating(false);
    }
  };

  return (
    <div className="space-y-5 pb-4">
      <header className="flex items-start gap-3">
        <Link
          href="/meds"
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
          aria-label="Back to medications"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="mono truncate text-xl font-semibold tracking-tight">{med.name}</h1>
            {med.strength ? <span className="mono text-sm text-muted">{med.strength}</span> : null}
            {!med.active ? (
              <Badge variant="neutral">
                <PauseCircle className="size-3" /> Inactive
              </Badge>
            ) : null}
            {med.isOtc ? <Badge variant="neutral">OTC</Badge> : <Badge variant="primary">Rx</Badge>}
            {med.prn ? <Badge variant="neutral">PRN</Badge> : null}
          </div>
          {med.genericName ? (
            <p className="mt-0.5 text-xs text-muted">
              Generic: <span className="mono">{med.genericName}</span>
              {med.rxnormCode ? <span className="ml-2">RxCUI {med.rxnormCode}</span> : null}
            </p>
          ) : null}
        </div>
      </header>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
          <Pencil className="size-3" /> Edit
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setLogOpen(true)}>
          <PlusCircle className="size-3" /> Log side effect
        </Button>
        {med.active ? (
          <Button variant="danger" size="sm" onClick={handleDeactivate} disabled={deactivating}>
            {deactivating ? <Loader2 className="size-3 animate-spin" /> : <PauseCircle className="size-3" />}
            Deactivate
          </Button>
        ) : null}
      </div>
      {actionError ? <p className="text-xs text-danger">{actionError}</p> : null}

      {/* Recall alerts (PRD §10.7) */}
      {medRecalls.length > 0 ? (
        <Card className="border-danger/40">
          {medRecalls.map((r) => (
            <div key={r.alertId.toString()} className="flex items-start gap-2 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
              <div>
                <p className="font-medium text-danger">Recall — {r.severity}</p>
                <p className="text-xs text-muted">{r.summary}</p>
              </div>
            </div>
          ))}
        </Card>
      ) : null}

      {/* Adherence + last taken */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted">7-day adherence</p>
              {adh ? (
                <p className="mt-1 text-lg font-semibold">
                  <span className="mono">{adh.pct}%</span>
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted">No data</p>
              )}
            </div>
            {adh ? (
              <Badge variant={adherenceVariant(adh.pct)}>
                {adh.taken}/{adh.scheduled}
              </Badge>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs text-muted">Last taken</p>
            <p className="mt-1 text-sm text-text">{last ? relativeTo(last) : "Never"}</p>
            {last ? <p className="text-[11px] text-muted">{clockTime(last)}</p> : null}
          </CardContent>
        </Card>
      </div>

      {/* Schedule */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="size-4 text-primary" /> Schedule
          </CardTitle>
          <Badge variant="neutral">{scheduleSummary(med)}</Badge>
        </CardHeader>
        <CardContent className="space-y-2">
          {med.prn ? (
            <p className="text-sm text-muted">As needed — no fixed dose times.</p>
          ) : med.scheduleTimes.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {med.scheduleTimes.map((t) => (
                <span key={t} className="mono rounded-full border border-border bg-elevated px-2.5 py-1 text-xs text-text">
                  {t}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-warning">No dose times set.</p>
          )}
          <p className="text-xs text-muted">Days: {scheduledDays}</p>
        </CardContent>
      </Card>

      {/* Prescriber / pharmacy / refill */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Stethoscope className="size-4 text-primary" /> Prescription
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-y-3 text-sm">
          <Field label="Prescriber" value={med.prescriber} />
          <Field label="Pharmacy" value={med.pharmacy} />
          <Field label="NDC" value={med.ndc} mono />
          <Field label="Doses remaining" value={String(med.dosesRemaining)} mono />
          <div className="col-span-2 flex items-center justify-between border-t border-border pt-3">
            <div className="flex items-center gap-2 text-xs text-muted">
              <RefreshCw className="size-3.5" />
              Refill {refillOn ? `on ${dayLabel(refillOn)}` : "date not set"}
            </div>
            {refill.daysLeft !== null ? (
              <Badge variant={refill.low ? "warning" : "neutral"}>
                {refill.daysLeft === 0 ? "Out of doses" : `~${refill.daysLeft}d of supply`}
              </Badge>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Interactions (PRD §9.3 → links to CascadeMap) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="size-4 text-primary" /> Interactions
          </CardTitle>
          <Link href="/cascade" className="text-xs text-primary underline-offset-2 hover:underline">
            Open CascadeMap
          </Link>
        </CardHeader>
        <CardContent className="space-y-3">
          {myPairs.length === 0 && myCascades.length === 0 ? (
            <p className="text-sm text-muted">
              No interactions flagged for this medication{cache ? "" : " yet"}.
            </p>
          ) : (
            <>
              {myPairs.map((p, i) => (
                <div key={`p-${i}`} className="rounded-[var(--radius)] border border-border p-3">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="mono text-xs text-text">{p.drugA}</span>
                    <span className="text-muted">+</span>
                    <span className="mono text-xs text-text">{p.drugB}</span>
                    <SeverityBadge severity={p.severity} />
                    <SourceTag source={p.source} />
                  </div>
                  {p.mechanism ? <p className="text-xs text-muted">{p.mechanism}</p> : null}
                  {p.source === "model" && typeof p.confidence === "number" ? (
                    <ConfidenceBar value={p.confidence} className="mt-2" />
                  ) : null}
                </div>
              ))}
              {myCascades.map((c, i) => (
                <div key={`c-${i}`} className="rounded-[var(--radius)] border border-danger/30 p-3">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-text">Cascade ({c.drugs.length} drugs)</span>
                    <SourceTag source={c.source === "mechanistic" ? "kb" : "model"} />
                  </div>
                  <p className="mono text-xs text-muted">{c.drugs.join(" + ")}</p>
                  <ConfidenceBar value={c.risk} label="Cascade risk" className="mt-2" />
                </div>
              ))}
            </>
          )}
          <Disclaimer />
        </CardContent>
      </Card>

      {/* Pharmacogenomic flag (PRD §10.4) */}
      {matchedPgx.length > 0 ? (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Dna className="size-4 text-primary" /> Pharmacogenomic flag
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {matchedPgx.map((f, i) => (
              <div key={i} className="rounded-[var(--radius)] border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="primary">{f.gene}</Badge>
                  <span className="text-xs text-text">{f.phenotype}</span>
                  {f.cpicLevel ? <Badge variant="neutral">CPIC {f.cpicLevel}</Badge> : null}
                </div>
                <p className="mt-1 text-xs text-text">{f.guidance}</p>
              </div>
            ))}
            {pgxCaveat ? <p className="text-[11px] text-muted">{pgxCaveat}</p> : null}
            <Disclaimer />
          </CardContent>
        </Card>
      ) : null}

      {/* Last scan + authenticity (PRD §10.1) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScanLine className="size-4 text-primary" /> Last scan
          </CardTitle>
          <Link href="/scan?intent=add" className="text-xs text-primary underline-offset-2 hover:underline">
            New scan
          </Link>
        </CardHeader>
        <CardContent className="space-y-2">
          {medScan ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <ShieldCheck className="size-4 text-muted" />
                <Badge variant={authVariant[medScan.authenticity] ?? "neutral"}>
                  {medScan.authenticity || "unknown"}
                </Badge>
                <span className="text-xs text-muted">{relativeTo(tsToDate(medScan.createdAt))}</span>
              </div>
              {medScan.identifiedDrug ? (
                <p className="text-xs text-muted">
                  Identified: <span className="mono text-text">{medScan.identifiedDrug}</span>
                </p>
              ) : null}
              {typeof medScan.idConfidence === "number" && medScan.idConfidence > 0 ? (
                <ConfidenceBar value={medScan.idConfidence} label="ID confidence" className="mt-1" />
              ) : null}
              <Disclaimer />
            </>
          ) : (
            <p className="text-sm text-muted">No scan linked to this medication yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Side effects for this med (PRD §9.3 / §10.3) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="size-4 text-primary" /> Side effects
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setLogOpen(true)}>
            <PlusCircle className="size-3" /> Log
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {medSideEffects.length === 0 ? (
            <p className="text-sm text-muted">None logged for this medication.</p>
          ) : (
            medSideEffects.map((e) => (
              <div
                key={e.effectId.toString()}
                className="flex items-start justify-between gap-3 rounded-[var(--radius)] border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm text-text">{e.symptom}</p>
                  <p className="text-[11px] text-muted">{relativeTo(tsToDate(e.loggedAt))}</p>
                </div>
                <Badge variant={e.severity >= 4 ? "danger" : e.severity >= 3 ? "warning" : "neutral"}>
                  Severity {e.severity}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {!dosesReady ? <p className="text-center text-[11px] text-muted">Syncing dose history…</p> : null}

      {me ? (
        <>
          <EditMedModal open={editOpen} onClose={() => setEditOpen(false)} med={med} />
          <LogSideEffectModal
            open={logOpen}
            onClose={() => setLogOpen(false)}
            owner={me}
            medId={med.medId}
            medName={med.name}
          />
        </>
      ) : null}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className={cn("text-sm text-text", mono && "mono")}>{value || "—"}</p>
    </div>
  );
}

// ---- interaction-cache JSON parsing (cache stores pairs/cascades as JSON) ----
function parsePairs(json?: string): PairFinding[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? (arr as PairFinding[]) : [];
  } catch {
    return [];
  }
}
function parseCascades(json?: string): CascadeFinding[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? (arr as CascadeFinding[]) : [];
  } catch {
    return [];
  }
}

function nameMatch(candidate: string, med: Medication): boolean {
  const c = (candidate || "").toLowerCase();
  if (!c) return false;
  const name = med.name.toLowerCase();
  const generic = med.genericName.toLowerCase();
  return Boolean(
    (name && (c.includes(name) || name.includes(c))) ||
      (generic && (c.includes(generic) || generic.includes(c)))
  );
}
function mentions(a: string, b: string, med: Medication): boolean {
  return nameMatch(a, med) || nameMatch(b, med);
}
