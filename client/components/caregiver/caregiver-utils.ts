// Pure helpers for CaregiverMode (PRD §10.6). No React — these compute the
// summaries and active-alert lists that the caregiver dashboard renders.
//
// Row field names are camelCase; u64 ids are bigint. Timestamps go through the
// shared format helpers.

import type { Infer } from "spacetimedb";
import CaregiverLinksRow from "@/lib/spacetime/caregiver_links_table";
import MedicationsRow from "@/lib/spacetime/medications_table";
import DosesRow from "@/lib/spacetime/doses_table";
import SideEffectsRow from "@/lib/spacetime/side_effects_table";
import RecallAlertsRow from "@/lib/spacetime/recall_alerts_table";
import { tsToDate } from "@/lib/format";
import { adherence7d, refillStatus } from "@/components/med/med-utils";

export type CaregiverLink = Infer<typeof CaregiverLinksRow>;
export type Medication = Infer<typeof MedicationsRow>;
export type Dose = Infer<typeof DosesRow>;
export type SideEffect = Infer<typeof SideEffectsRow>;
export type RecallAlert = Infer<typeof RecallAlertsRow>;

// ---- access levels ----

export type AccessLevel = "view" | "log" | "manage";
export type LinkStatus = "pending" | "accepted" | "revoked";

export const ACCESS_LEVELS: { value: AccessLevel; label: string; blurb: string }[] = [
  { value: "view", label: "View", blurb: "See adherence and alerts (read-only)." },
  { value: "log", label: "Log", blurb: "Also log doses on the patient's behalf." },
  { value: "manage", label: "Manage", blurb: "Also view and manage the patient's medications." },
];

export function accessLabel(level: string): string {
  return ACCESS_LEVELS.find((a) => a.value === level)?.label ?? level;
}

/** Caregiver can log doses for this patient. */
export function canLog(level: string): boolean {
  return level === "log" || level === "manage";
}

/** Caregiver can view/manage the patient's medication list. */
export function canManage(level: string): boolean {
  return level === "manage";
}

export function statusVariant(status: string): "neutral" | "primary" | "success" | "warning" | "danger" {
  switch (status) {
    case "accepted":
      return "success";
    case "pending":
      return "warning";
    case "revoked":
      return "danger";
    default:
      return "neutral";
  }
}

// ---- per-patient summary ----

export interface PatientSummary {
  activeMeds: number;
  /** Overall 7-day adherence across active scheduled meds, or null if nothing to measure. */
  adherencePct: number | null;
  takenLast7d: number;
  scheduledLast7d: number;
}

/**
 * Aggregate 7-day adherence across all of the patient's active, scheduled meds.
 * Reuses the per-med adherence calc so caregiver + owner views agree.
 */
export function patientSummary(
  meds: readonly Medication[],
  doses: readonly Dose[],
  now: Date = new Date()
): PatientSummary {
  const active = meds.filter((m) => m.active);
  let taken = 0;
  let scheduled = 0;
  for (const med of active) {
    const adh = adherence7d(doses, med.medId, now);
    if (adh) {
      taken += adh.taken;
      scheduled += adh.scheduled;
    }
  }
  return {
    activeMeds: active.length,
    adherencePct: scheduled > 0 ? Math.round((taken / scheduled) * 100) : null,
    takenLast7d: taken,
    scheduledLast7d: scheduled,
  };
}

// ---- active alerts ----

export type AlertKind = "missed" | "side-effect" | "refill" | "recall";

export interface CaregiverAlert {
  id: string;
  kind: AlertKind;
  title: string;
  detail: string;
  /** Severity drives the badge color: danger > warning > neutral. */
  severity: "danger" | "warning" | "neutral";
  at: Date | null;
}

const SIDE_EFFECT_WINDOW_HOURS = 72;
const MISSED_WINDOW_HOURS = 48;

/**
 * Build the active-alert list for a patient (PRD §10.6): missed doses, new side
 * effects, refills due, and unacknowledged recall alerts. Sorted newest-first
 * within a danger-before-warning ordering.
 */
export function activeAlerts(
  meds: readonly Medication[],
  doses: readonly Dose[],
  sideEffects: readonly SideEffect[],
  recalls: readonly RecallAlert[],
  now: Date = new Date()
): CaregiverAlert[] {
  const alerts: CaregiverAlert[] = [];
  const medById = new Map<string, Medication>();
  for (const m of meds) medById.set(m.medId.toString(), m);

  // Missed doses in the recent window.
  const missedCutoff = now.getTime() - MISSED_WINDOW_HOURS * 3_600_000;
  for (const d of doses) {
    if (d.status !== "missed") continue;
    const at = tsToDate(d.scheduledAt);
    if (!at || at.getTime() < missedCutoff) continue;
    const med = medById.get(d.medId.toString());
    alerts.push({
      id: `missed-${d.doseId.toString()}`,
      kind: "missed",
      title: `Missed dose — ${med?.name ?? "medication"}`,
      detail: med?.strength ? med.strength : "Scheduled dose was not taken.",
      severity: "warning",
      at,
    });
  }

  // New side effects in the recent window.
  const seCutoff = now.getTime() - SIDE_EFFECT_WINDOW_HOURS * 3_600_000;
  for (const se of sideEffects) {
    const at = tsToDate(se.loggedAt);
    if (!at || at.getTime() < seCutoff) continue;
    const med = se.medId !== undefined ? medById.get(se.medId.toString()) : undefined;
    alerts.push({
      id: `se-${se.effectId.toString()}`,
      kind: "side-effect",
      title: `New side effect — ${se.symptom}`,
      detail: `Severity ${se.severity}/5${med ? ` · ${med.name}` : ""}`,
      severity: se.severity >= 4 ? "danger" : "warning",
      at,
    });
  }

  // Refills due on active meds.
  for (const med of meds) {
    if (!med.active) continue;
    const refill = refillStatus(med);
    if (!refill.low) continue;
    alerts.push({
      id: `refill-${med.medId.toString()}`,
      kind: "refill",
      title: `Refill due — ${med.name}`,
      detail:
        refill.daysLeft === 0 || refill.daysLeft === null
          ? "Out of doses"
          : `~${refill.daysLeft} day${refill.daysLeft === 1 ? "" : "s"} of supply left`,
      severity: refill.daysLeft === 0 ? "danger" : "warning",
      at: null,
    });
  }

  // Unacknowledged recall alerts.
  for (const r of recalls) {
    if (r.acknowledged) continue;
    const med = medById.get(r.medId.toString());
    alerts.push({
      id: `recall-${r.alertId.toString()}`,
      kind: "recall",
      title: `Recall alert — ${med?.name ?? "medication"}`,
      detail: r.summary || `Severity: ${r.severity}`,
      severity: "danger",
      at: tsToDate(r.createdAt),
    });
  }

  const sevRank = { danger: 0, warning: 1, neutral: 2 } as const;
  return alerts.sort((a, b) => {
    if (a.severity !== b.severity) return sevRank[a.severity] - sevRank[b.severity];
    return (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0);
  });
}

/** A short, stable label for an identity (first/last hex chunks). */
export function shortIdentity(hex: string): string {
  if (!hex) return "—";
  return `${hex.slice(0, 6)}…${hex.slice(-4)}`;
}
