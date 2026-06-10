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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/shared/states";
import { clockTime } from "@/lib/format";
import { adherenceVariant } from "@/components/med/med-utils";
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

function AlertRow({ alert }: { alert: CaregiverAlert }) {
  const Icon = ALERT_ICON[alert.kind];
  const tone =
    alert.severity === "danger"
      ? "text-danger"
      : alert.severity === "warning"
        ? "text-warning"
        : "text-muted";
  return (
    <li className="flex items-start gap-2.5 rounded-[var(--radius)] border border-border bg-elevated p-2.5">
      <Icon className={`mt-0.5 size-4 shrink-0 ${tone}`} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-text">{alert.title}</p>
        <p className="text-[11px] text-muted">{alert.detail}</p>
      </div>
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
    <Card className="space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-elevated text-muted">
            <User className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text">
              {link.caregiverEmail || "Patient"}
            </p>
            <p className="mono truncate text-[11px] text-muted">{shortIdentity(patientHex)}</p>
          </div>
        </div>
        <AccessBadge level={link.accessLevel} />
      </div>

      {!ready ? (
        <LoadingState label="Loading patient summary…" />
      ) : (
        <>
          {/* Adherence summary */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-[var(--radius)] border border-border bg-elevated p-2.5 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted">7-day adherence</p>
              {summary.adherencePct !== null ? (
                <Badge variant={adherenceVariant(summary.adherencePct)} className="mt-1">
                  {summary.adherencePct}%
                </Badge>
              ) : (
                <p className="mt-1 text-xs text-muted">No data</p>
              )}
            </div>
            <div className="rounded-[var(--radius)] border border-border bg-elevated p-2.5 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted">Active meds</p>
              <p className="mt-1 text-sm font-semibold text-text">{summary.activeMeds}</p>
            </div>
            <div className="rounded-[var(--radius)] border border-border bg-elevated p-2.5 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted">Open alerts</p>
              <p
                className={`mt-1 text-sm font-semibold ${
                  alerts.length > 0 ? "text-warning" : "text-text"
                }`}
              >
                {alerts.length}
              </p>
            </div>
          </div>

          {/* Active alerts */}
          <section aria-label="Active alerts" className="space-y-1.5">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Active alerts
            </h4>
            {alerts.length === 0 ? (
              <p className="flex items-center gap-1.5 rounded-[var(--radius)] border border-border bg-elevated p-2.5 text-xs text-muted">
                <Check className="size-3.5 text-success" />
                No active alerts — adherence, refills, side effects and recalls look clear.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {alerts.map((a) => (
                  <AlertRow key={a.id} alert={a} />
                ))}
              </ul>
            )}
          </section>

          {logError ? (
            <p className="rounded-[var(--radius)] border border-danger/30 bg-danger/10 p-2 text-xs text-danger">
              {logError}
            </p>
          ) : null}

          {/* Access-aware actions */}
          {log ? (
            <section aria-label="Log today's doses" className="space-y-1.5">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="flex w-full items-center justify-between rounded-[var(--radius)] border border-border bg-elevated px-3 py-2 text-xs font-medium text-text transition-fast hover:border-primary/40"
                aria-expanded={expanded}
              >
                <span className="flex items-center gap-1.5">
                  <Check className="size-3.5 text-primary" />
                  Log today&apos;s doses ({pendingToday.length} pending)
                </span>
                {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              </button>
              {expanded ? (
                pendingToday.length === 0 ? (
                  <p className="px-1 text-xs text-muted">No pending doses for today.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {pendingToday.map((row) => {
                      const busy = busyDoseId === row.dose.doseId;
                      return (
                        <li
                          key={row.dose.doseId.toString()}
                          className="flex items-center gap-2 rounded-[var(--radius)] border border-border bg-elevated p-2.5"
                        >
                          <span className="mono flex w-14 shrink-0 items-center gap-1 text-xs text-muted">
                            {clockTime(row.scheduledAt)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="mono truncate text-xs text-text">
                              {row.med?.name ?? "Medication"}
                            </p>
                            {row.med?.strength ? (
                              <p className="mono truncate text-[11px] text-muted">{row.med.strength}</p>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleLog(row, "skipped")}
                              disabled={busy}
                              aria-label={`Skip ${row.med?.name ?? "dose"} for patient`}
                            >
                              <X className="size-4" />
                              Skip
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleLog(row, "taken")}
                              disabled={busy}
                              aria-label={`Mark ${row.med?.name ?? "dose"} taken for patient`}
                            >
                              <Check className="size-4" />
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
                className="flex w-full items-center justify-between rounded-[var(--radius)] border border-border bg-elevated px-3 py-2 text-xs font-medium text-text transition-fast hover:border-primary/40"
                aria-expanded={showMeds}
              >
                <span className="flex items-center gap-1.5">
                  <Pill className="size-3.5 text-primary" />
                  Patient medications
                </span>
                {showMeds ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              </button>
              {showMeds ? <PatientMedsList meds={meds} doses={doses} /> : null}
            </section>
          ) : null}

          {/* Access scope hint */}
          {!log && !manage ? (
            <p className="flex items-center gap-1.5 text-[11px] text-muted">
              <Eye className="size-3" />
              Read-only access — you can see adherence and alerts, but not log doses or change meds.
            </p>
          ) : null}

          <p className="border-t border-border pt-2 text-[10px] leading-relaxed text-muted">
            Decision-support — confirm with your pharmacist or prescriber.
          </p>
        </>
      )}
    </Card>
  );
}
