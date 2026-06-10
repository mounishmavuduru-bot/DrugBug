"use client";

import { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Check,
  ChevronDown,
  ChevronUp,
  CircleSlash,
  Eye,
  Pill,
  RefreshCw,
  User,
  X,
} from "lucide-react";
import { Identity } from "spacetimedb";
import { useReducer } from "spacetimedb/react";
import { reducers } from "@/lib/db";
import { usePatientMeds, useDoses, useSideEffects, useRecalls } from "@/lib/hooks";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/shared/states";
import { clockTime } from "@/lib/format";
import { todaysDoses, isLate, type DoseWithMed } from "@/components/today/today-utils";
import { PatientMedsList } from "@/components/caregiver/patient-meds-list";
import { AccessBadge } from "@/components/caregiver/access-badge";
import {
  patientSummary,
  activeAlerts,
  canLog,
  canManage,
  shortIdentity,
  type CaregiverLink,
  type CaregiverAlert,
} from "@/components/caregiver/caregiver-utils";

const ALERT_ICON = {
  missed: CircleSlash,
  "side-effect": AlertTriangle,
  refill: RefreshCw,
  recall: Bell,
} as const;

const ALERT_KIND_LABEL = {
  missed: "Missed",
  "side-effect": "Side effect",
  refill: "Refill",
  recall: "Recall",
} as const;

/** Ink-tone for the large adherence figure. Mirrors adherenceVariant thresholds. */
function adherenceTone(pct: number): string {
  if (pct >= 80) return "text-positive";
  if (pct >= 50) return "text-monitor";
  return "text-danger";
}

function AlertRow({ alert }: { alert: CaregiverAlert }) {
  const Icon = ALERT_ICON[alert.kind];
  const tone =
    alert.severity === "danger"
      ? "text-danger"
      : alert.severity === "warning"
        ? "text-caution"
        : "text-muted";
  return (
    <li className="flex items-start gap-3 border-t border-rule px-3.5 py-2.5 first:border-t-0">
      <Icon className={`mt-0.5 size-4 shrink-0 ${tone}`} strokeWidth={1.75} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-ink">{alert.title}</p>
        <p className="text-[11px] text-muted">{alert.detail}</p>
      </div>
      <span className="label-mono shrink-0 pt-0.5 text-[10px] uppercase tracking-[0.1em] text-faint">
        {ALERT_KIND_LABEL[alert.kind]}
      </span>
    </li>
  );
}

/**
 * One linked patient on the caregiver dashboard (PRD §10.6): adherence summary
 * + active alerts (missed doses, new side effects, refills due, recall alerts),
 * all realtime. Access-aware:
 *   - view   → read-only summary + alerts
 *   - log    → can also log today's doses inline (logDose)
 *   - manage → can also view the patient's medication list
 */
export function PatientDashboardCard({ link }: { link: CaregiverLink }) {
  const patient = useMemo(
    () => Identity.fromString(link.patientIdentity.toHexString()),
    [link.patientIdentity]
  );

  const { meds, ready: medsReady } = usePatientMeds(patient);
  const { doses, ready: dosesReady } = useDoses(patient);
  const { sideEffects, ready: seReady } = useSideEffects(patient);
  const { recalls, ready: recallsReady } = useRecalls(patient);

  const logDose = useReducer(reducers.logDose);
  const [busyDoseId, setBusyDoseId] = useState<bigint | undefined>(undefined);
  const [logError, setLogError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showMeds, setShowMeds] = useState(false);

  const ready = medsReady && dosesReady && seReady && recallsReady;

  const summary = useMemo(() => patientSummary(meds, doses), [meds, doses]);
  const alerts = useMemo(
    () => activeAlerts(meds, doses, sideEffects, recalls),
    [meds, doses, sideEffects, recalls]
  );
  const todayRows = useMemo(() => todaysDoses(doses, meds), [doses, meds]);
  const pendingToday = useMemo(
    () => todayRows.filter((r) => r.dose.status === "pending"),
    [todayRows]
  );

  const log = canLog(link.accessLevel);
  const manage = canManage(link.accessLevel);

  const handleLog = useCallback(
    async (row: DoseWithMed, status: "taken" | "skipped") => {
      setBusyDoseId(row.dose.doseId);
      setLogError(null);
      try {
        const finalStatus = status === "taken" && isLate(row.scheduledAt) ? "late" : status;
        await logDose({ doseId: row.dose.doseId, status: finalStatus, notes: "Logged by caregiver" });
      } catch (e) {
        setLogError(e instanceof Error ? e.message : "Could not log this dose.");
      } finally {
        setBusyDoseId(undefined);
      }
    },
    [logDose]
  );

  const patientHex = link.patientIdentity.toHexString();

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-rule px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-brand-tint text-brand">
            <User className="size-4" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">
              {link.caregiverEmail || "Patient"}
            </p>
            <p className="label-mono truncate text-[11px] text-muted">{shortIdentity(patientHex)}</p>
          </div>
        </div>
        <AccessBadge level={link.accessLevel} />
      </div>

      {!ready ? (
        <div className="px-4 py-4">
          <LoadingState rows={2} label="Loading patient summary…" />
        </div>
      ) : (
        <div className="space-y-4 px-4 py-4">
          {/* Lead with adherence — the one figure a caregiver scans for. The 7-day
              percentage reads at display size; meds + alert counts sit beside it as
              quiet secondary facts, not three equal cards. */}
          <div className="flex items-end justify-between gap-4 border-b border-rule pb-4">
            <div className="min-w-0">
              <p className="label-mono text-[11px] uppercase tracking-[0.14em] text-faint">
                Adherence · last 7 days
              </p>
              {summary.adherencePct !== null ? (
                <p className="mt-1 flex items-baseline gap-2">
                  <span
                    className={`font-display tnum text-[2.6rem] leading-none ${adherenceTone(
                      summary.adherencePct
                    )}`}
                  >
                    {summary.adherencePct}
                    <span className="text-[1.4rem]">%</span>
                  </span>
                </p>
              ) : (
                <p className="mt-2 text-sm text-faint">No doses logged this week.</p>
              )}
              {summary.scheduledLast7d > 0 ? (
                <p className="label-mono mt-1.5 text-[11px] text-muted">
                  <span className="tnum">{summary.takenLast7d}</span> of{" "}
                  <span className="tnum">{summary.scheduledLast7d}</span> scheduled doses on time
                </p>
              ) : null}
            </div>
            <dl className="shrink-0 space-y-1.5 text-right">
              <div className="flex items-baseline justify-end gap-2">
                <dt className="text-[11px] text-muted">Active meds</dt>
                <dd className="tnum text-sm font-semibold text-ink">{summary.activeMeds}</dd>
              </div>
              <div className="flex items-baseline justify-end gap-2">
                <dt className="text-[11px] text-muted">Open alerts</dt>
                <dd
                  className={`tnum text-sm font-semibold ${
                    alerts.length > 0 ? "text-caution" : "text-positive"
                  }`}
                >
                  {alerts.length}
                </dd>
              </div>
            </dl>
          </div>

          {/* Active alerts */}
          <section aria-label="Active alerts" className="space-y-2">
            <h4 className="text-sm font-semibold text-ink">
              {alerts.length > 0 ? "Needs attention" : "Nothing flagged"}
            </h4>
            {alerts.length === 0 ? (
              <p className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-rule bg-surface px-3.5 py-2.5 text-xs text-muted">
                <Check className="size-3.5 text-positive" strokeWidth={1.75} />
                No missed doses, refills, side effects, or recalls in the last few days.
              </p>
            ) : (
              <ul className="rounded-[var(--radius-sm)] border border-rule bg-card">
                {alerts.map((a) => (
                  <AlertRow key={a.id} alert={a} />
                ))}
              </ul>
            )}
          </section>

          {logError ? (
            <p className="rounded-[var(--radius-sm)] border border-rule bg-danger-tint px-3 py-2 text-xs text-danger">
              {logError}
            </p>
          ) : null}

          {/* Access-aware actions */}
          {log ? (
            <section aria-label="Log today's doses" className="space-y-1.5">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="flex w-full items-center justify-between rounded-[var(--radius-sm)] border border-rule-strong bg-card px-3 py-2 text-xs font-medium text-ink transition-colors duration-150 ease-[var(--ease)] hover:bg-brand-tint"
                aria-expanded={expanded}
              >
                <span className="flex items-center gap-1.5">
                  <Check className="size-3.5 text-brand" strokeWidth={1.75} />
                  Log today&apos;s doses ({pendingToday.length} pending)
                </span>
                {expanded ? (
                  <ChevronUp className="size-4" strokeWidth={1.75} />
                ) : (
                  <ChevronDown className="size-4" strokeWidth={1.75} />
                )}
              </button>
              {expanded ? (
                pendingToday.length === 0 ? (
                  <p className="px-1 text-xs text-muted">Nothing left to log for today.</p>
                ) : (
                  <ul className="divide-y divide-rule rounded-[var(--radius-sm)] border border-rule bg-card">
                    {pendingToday.map((row) => {
                      const busy = busyDoseId === row.dose.doseId;
                      return (
                        <li
                          key={row.dose.doseId.toString()}
                          className="flex items-center gap-2 px-3 py-2.5"
                        >
                          <span className="label-mono flex w-14 shrink-0 items-center text-xs text-muted">
                            {clockTime(row.scheduledAt)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="label-mono truncate text-xs text-ink">
                              {row.med?.name ?? "Medication"}
                            </p>
                            {row.med?.strength ? (
                              <p className="label-mono truncate text-[11px] text-muted">
                                {row.med.strength}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <Button
                              variant="quiet"
                              size="sm"
                              onClick={() => handleLog(row, "skipped")}
                              disabled={busy}
                              aria-label={`Skip ${row.med?.name ?? "dose"} for patient`}
                            >
                              <X className="size-4" strokeWidth={1.75} />
                              Skip
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleLog(row, "taken")}
                              disabled={busy}
                              aria-label={`Mark ${row.med?.name ?? "dose"} taken for patient`}
                            >
                              <Check className="size-4" strokeWidth={1.75} />
                              Taken
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )
              ) : null}
            </section>
          ) : null}

          {manage ? (
            <section aria-label="Patient medications" className="space-y-1.5">
              <button
                type="button"
                onClick={() => setShowMeds((v) => !v)}
                className="flex w-full items-center justify-between rounded-[var(--radius-sm)] border border-rule-strong bg-card px-3 py-2 text-xs font-medium text-ink transition-colors duration-150 ease-[var(--ease)] hover:bg-brand-tint"
                aria-expanded={showMeds}
              >
                <span className="flex items-center gap-1.5">
                  <Pill className="size-3.5 text-brand" strokeWidth={1.75} />
                  Patient medications
                </span>
                {showMeds ? (
                  <ChevronUp className="size-4" strokeWidth={1.75} />
                ) : (
                  <ChevronDown className="size-4" strokeWidth={1.75} />
                )}
              </button>
              {showMeds ? <PatientMedsList meds={meds} doses={doses} /> : null}
            </section>
          ) : null}

          {/* Access scope hint */}
          {!log && !manage ? (
            <p className="flex items-center gap-1.5 text-[11px] text-muted">
              <Eye className="size-3" strokeWidth={1.75} />
              Read-only access. You can see adherence and alerts, but not log doses or change meds.
            </p>
          ) : null}

          <p className="border-t border-rule pt-2.5 text-[11px] leading-relaxed text-muted">
            Decision support, not a diagnosis — confirm with your pharmacist or prescriber.
          </p>
        </div>
      )}
    </Card>
  );
}
