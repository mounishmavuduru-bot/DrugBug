"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  PauseCircle,
  Pencil,
  Pill,
  PlusCircle,
  RefreshCw,
  ShieldCheck,
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
import { Card, CardContent } from "@/components/ui/card";
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
  refillStatus,
  WEEKDAYS,
  type Medication,
} from "@/components/med/med-utils";
import { cn } from "@/lib/utils";

const authVariant: Record<string, "positive" | "caution" | "danger" | "neutral"> = {
  verified: "positive",
  inconclusive: "caution",
  suspect: "danger",
};

const authLabel: Record<string, string> = {
  verified: "Verified",
  inconclusive: "Inconclusive",
  suspect: "Suspect",
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
    return <ErrorState title="That link looks wrong" description="The medication id in the address isn't valid." />;
  }
  if (!medsReady) {
    return <LoadingState label="Loading this medication" />;
  }
  if (!med) {
    return (
      <EmptyState
        icon={Pill}
        title="Medication not found"
        description="It may have been removed from your list."
        action={
          <Link href="/meds" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Back to the list
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
      setActionError(e instanceof Error ? e.message : "Couldn't deactivate this. Try again.");
      setDeactivating(false);
    }
  };

  return (
    <div className="space-y-6 pb-4">
      <div>
        <Link
          href="/meds"
          className="label-mono inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-muted transition-colors duration-150 ease-[var(--ease)] hover:text-ink"
        >
          <ArrowLeft className="size-3.5" strokeWidth={1.75} aria-hidden /> Formulary
        </Link>
      </div>

      {/* Monograph masthead — the drug name is the one dominant element. */}
      <header className="border-b border-rule-strong pb-5">
        <p className="label-mono text-[11px] uppercase tracking-[0.16em] text-muted">
          {med.isOtc ? "Over the counter" : "Prescription"}
          {med.prn ? " · as needed" : ""}
          {!med.active ? " · inactive" : ""}
        </p>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="label-mono min-w-0 break-words text-3xl font-medium leading-tight text-ink">
            {med.name}
          </h1>
          {med.strength ? <span className="label-mono text-lg text-muted">{med.strength}</span> : null}
        </div>
        {med.genericName || med.rxnormCode ? (
          <p className="mt-2 text-xs text-muted">
            {med.genericName ? (
              <>
                Generic <span className="label-mono text-ink">{med.genericName}</span>
              </>
            ) : null}
            {med.rxnormCode ? (
              <span className="ml-2 label-mono text-muted">RxCUI {med.rxnormCode}</span>
            ) : null}
          </p>
        ) : null}
      </header>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
          <Pencil aria-hidden /> Edit
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setLogOpen(true)}>
          <PlusCircle aria-hidden /> Log side effect
        </Button>
        {med.active ? (
          <Button variant="danger" size="sm" onClick={handleDeactivate} disabled={deactivating}>
            {deactivating ? <Loader2 className="animate-spin" /> : <PauseCircle aria-hidden />}
            Deactivate
          </Button>
        ) : null}
      </div>
      {actionError ? <p className="text-xs text-danger" role="alert">{actionError}</p> : null}

      {/* Recall alerts (PRD §10.7) */}
      {medRecalls.length > 0 ? (
        <Card className="border-danger bg-danger-tint">
          <CardContent className="space-y-2">
            {medRecalls.map((r) => (
              <div key={r.alertId.toString()} className="flex items-start gap-2 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" strokeWidth={1.75} />
                <div>
                  <p className="font-medium text-danger">Recall — {r.severity}</p>
                  <p className="text-xs text-muted">{r.summary}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* At a glance — adherence is the one figure; last-taken sits beside it,
          divided by a rule rather than boxed into a second stat card. */}
      <div className="flex items-stretch gap-5 border-t border-rule pt-4">
        <div className="min-w-0 flex-1">
          <p className="label-mono text-[11px] uppercase tracking-[0.12em] text-muted">
            On time, last 7 days
          </p>
          {adh ? (
            <div className="mt-1 flex items-baseline gap-2.5">
              <span className="font-display text-3xl leading-none text-ink tnum">{adh.pct}%</span>
              <span className="label-mono text-xs text-muted tnum">
                {adh.taken}/{adh.scheduled} doses
              </span>
            </div>
          ) : (
            <p className="mt-1.5 text-sm text-muted">No scheduled doses to measure yet.</p>
          )}
        </div>
        <div className="w-px shrink-0 bg-rule" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="label-mono text-[11px] uppercase tracking-[0.12em] text-muted">Last taken</p>
          <p className="mt-1.5 text-sm text-ink">{last ? relativeTo(last) : "Never"}</p>
          {last ? <p className="label-mono text-[11px] text-muted tnum">{clockTime(last)}</p> : null}
        </div>
      </div>

      {/* Schedule */}
      <Section
        label="Schedule"
        aside={<Badge variant="neutral">{scheduleSummary(med)}</Badge>}
      >
        {med.prn ? (
          <p className="text-sm text-muted">Taken only when needed — no fixed dose times.</p>
        ) : med.scheduleTimes.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {med.scheduleTimes.map((t) => (
              <span
                key={t}
                className="label-mono tnum rounded-[var(--radius-pill)] border border-rule-strong bg-surface px-2.5 py-1 text-xs text-ink"
              >
                {t}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-caution">No dose times set yet.</p>
        )}
        <p className="mt-2.5 text-xs text-muted">
          Days <span className="text-ink">{scheduledDays}</span>
        </p>
      </Section>

      {/* Prescriber / pharmacy / refill — a ruled Rx field list. */}
      <Section label="Prescription">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Field label="Prescriber" value={med.prescriber} />
          <Field label="Pharmacy" value={med.pharmacy} />
          <Field label="NDC" value={med.ndc} mono />
          <Field label="Doses remaining" value={String(med.dosesRemaining)} mono />
        </dl>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-rule pt-3">
          <span className="inline-flex items-center gap-2 text-xs text-muted">
            <RefreshCw className="size-3.5" strokeWidth={1.75} aria-hidden />
            Refill {refillOn ? `on ${dayLabel(refillOn)}` : "date not set"}
          </span>
          {refill.daysLeft !== null ? (
            <Badge variant={refill.low ? "caution" : "neutral"}>
              {refill.daysLeft === 0 ? "Out of doses" : `About ${refill.daysLeft} days of supply`}
            </Badge>
          ) : null}
        </div>
      </Section>

      {/* Interactions (PRD §9.3 → links to CascadeMap) */}
      <Section
        label="Interactions"
        aside={
          <Link
            href="/cascade"
            className="text-xs font-medium text-brand underline decoration-rule-strong underline-offset-4 transition-colors duration-150 ease-[var(--ease)] hover:decoration-brand"
          >
            Open the interaction map
          </Link>
        }
      >
        <div className="space-y-3">
          {myPairs.length === 0 && myCascades.length === 0 ? (
            <p className="text-sm text-muted">
              {cache
                ? "Nothing flagged for this medication against your current list."
                : "We haven't run an interaction check yet for this medication."}
            </p>
          ) : (
            <>
              {myPairs.map((p, i) => (
                <div key={`p-${i}`} className="rounded-[var(--radius-sm)] border border-rule bg-surface p-3">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="label-mono text-xs text-ink">{p.drugA}</span>
                    <span className="text-faint">+</span>
                    <span className="label-mono text-xs text-ink">{p.drugB}</span>
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
                <div key={`c-${i}`} className="rounded-[var(--radius-sm)] border border-danger bg-danger-tint p-3">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-ink">Cascade across {c.drugs.length} drugs</span>
                    <SourceTag source={c.source === "mechanistic" ? "kb" : "model"} />
                  </div>
                  <p className="label-mono text-xs text-muted">{c.drugs.join(" + ")}</p>
                  <ConfidenceBar value={c.risk} label="Cascade risk" className="mt-2" />
                </div>
              ))}
            </>
          )}
          <Disclaimer />
        </div>
      </Section>

      {/* Pharmacogenomic flag (PRD §10.4) */}
      {matchedPgx.length > 0 ? (
        <Section label="Pharmacogenomic flag">
          <div className="space-y-2">
            {matchedPgx.map((f, i) => (
              <div key={i} className="rounded-[var(--radius-sm)] border border-rule bg-surface p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="brand">{f.gene}</Badge>
                  <span className="text-xs text-ink">{f.phenotype}</span>
                  {f.cpicLevel ? <Badge variant="neutral">CPIC {f.cpicLevel}</Badge> : null}
                </div>
                <p className="mt-1 text-xs text-ink">{f.guidance}</p>
              </div>
            ))}
            {pgxCaveat ? <p className="text-[11px] text-muted">{pgxCaveat}</p> : null}
            <Disclaimer />
          </div>
        </Section>
      ) : null}

      {/* Last scan + authenticity (PRD §10.1) */}
      <Section
        label="Last scan"
        aside={
          <Link
            href="/scan?intent=add"
            className="text-xs font-medium text-brand underline decoration-rule-strong underline-offset-4 transition-colors duration-150 ease-[var(--ease)] hover:decoration-brand"
          >
            New scan
          </Link>
        }
      >
        {medScan ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <ShieldCheck className="size-4 text-muted" strokeWidth={1.75} aria-hidden />
              <Badge variant={authVariant[medScan.authenticity] ?? "neutral"}>
                {authLabel[medScan.authenticity] ?? medScan.authenticity ?? "Unknown"}
              </Badge>
              <span className="text-xs text-muted">{relativeTo(tsToDate(medScan.createdAt))}</span>
            </div>
            {medScan.identifiedDrug ? (
              <p className="text-xs text-muted">
                Identified as <span className="label-mono text-ink">{medScan.identifiedDrug}</span>
              </p>
            ) : null}
            {typeof medScan.idConfidence === "number" && medScan.idConfidence > 0 ? (
              <ConfidenceBar value={medScan.idConfidence} label="ID confidence" className="mt-1" />
            ) : null}
            <Disclaimer />
          </div>
        ) : (
          <p className="text-sm text-muted">No scan is linked to this medication yet.</p>
        )}
      </Section>

      {/* Side effects for this med (PRD §9.3 / §10.3) */}
      <Section
        label="Side effects"
        aside={
          <Button variant="quiet" size="sm" onClick={() => setLogOpen(true)}>
            <PlusCircle aria-hidden /> Log
          </Button>
        }
      >
        {medSideEffects.length === 0 ? (
          <p className="text-sm text-muted">Nothing logged for this medication.</p>
        ) : (
          <ul className="border-t border-rule">
            {medSideEffects.map((e) => (
              <li
                key={e.effectId.toString()}
                className="flex items-start justify-between gap-3 border-b border-rule py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm text-ink">{e.symptom}</p>
                  <p className="label-mono text-[11px] text-muted">{relativeTo(tsToDate(e.loggedAt))}</p>
                </div>
                <Badge variant={e.severity >= 4 ? "danger" : e.severity >= 3 ? "caution" : "neutral"}>
                  Severity {e.severity}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {!dosesReady ? <p className="text-center text-[11px] text-muted">Syncing dose history</p> : null}

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

/**
 * A monograph section: a ruled reference-label heading with an optional aside
 * (a status chip or a link), then the section body. Replaces the stack of
 * identical icon-headed cards so the page reads like a printed entry, not a deck.
 */
function Section({
  label,
  aside,
  children,
}: {
  label: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-rule pt-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="label-mono text-[11px] uppercase tracking-[0.16em] text-muted">{label}</h2>
        {aside ?? null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="label-mono text-[11px] uppercase tracking-[0.12em] text-muted">{label}</dt>
      <dd className={cn("mt-0.5 text-sm text-ink", mono && "label-mono")}>{value || "—"}</dd>
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
