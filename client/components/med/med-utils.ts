// Shared helpers for the medication screens (PRD §9.3/§9.4/§9.5).
// Pure functions only — no React. Row field names are camelCase; u64 ids are
// bigint; schedule_days is a Uint8Array of weekday indices (0=Sun..6=Sat).

import type { Infer } from "spacetimedb";
import MedicationsRow from "@/lib/spacetime/medications_table";
import DosesRow from "@/lib/spacetime/doses_table";
import { tsToDate } from "@/lib/format";

export type Medication = Infer<typeof MedicationsRow>;
export type Dose = Infer<typeof DosesRow>;

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** "08:00,20:00 · Daily" style one-line schedule summary for cards. */
export function scheduleSummary(med: Pick<Medication, "scheduleTimes" | "scheduleDays" | "prn">): string {
  if (med.prn) return "As needed (PRN)";
  const times = med.scheduleTimes.length ? med.scheduleTimes.join(", ") : "No times set";
  const days = Array.from(med.scheduleDays);
  const dayLabel =
    days.length === 0 || days.length === 7
      ? "Daily"
      : days
          .slice()
          .sort((a, b) => a - b)
          .map((d) => WEEKDAYS[d] ?? d)
          .join(" ");
  return `${times} · ${dayLabel}`;
}

/** Doses for one med, newest first. */
export function dosesForMed(doses: readonly Dose[], medId: bigint): Dose[] {
  return doses
    .filter((d) => d.medId === medId)
    .sort((a, b) => {
      const da = tsToDate(a.scheduledAt)?.getTime() ?? 0;
      const db = tsToDate(b.scheduledAt)?.getTime() ?? 0;
      return db - da;
    });
}

/** Most recent dose that was actually taken (or marked late). */
export function lastTaken(doses: readonly Dose[], medId: bigint): Date | null {
  const taken = doses
    .filter((d) => d.medId === medId && (d.status === "taken" || d.status === "late") && d.takenAt)
    .map((d) => tsToDate(d.takenAt))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime());
  return taken[0] ?? null;
}

/**
 * 7-day adherence for a med: of the doses scheduled in the last 7 days whose
 * time has already passed, what fraction were taken/late. Returns null when
 * there is nothing scheduled to measure (PRN, brand new, no history).
 */
export function adherence7d(
  doses: readonly Dose[],
  medId: bigint,
  now: Date = new Date()
): { pct: number; taken: number; scheduled: number } | null {
  const cutoff = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const window = doses.filter((d) => {
    if (d.medId !== medId) return false;
    const at = tsToDate(d.scheduledAt)?.getTime();
    return at !== undefined && at >= cutoff && at <= now.getTime();
  });
  if (window.length === 0) return null;
  const taken = window.filter((d) => d.status === "taken" || d.status === "late").length;
  return { pct: Math.round((taken / window.length) * 100), taken, scheduled: window.length };
}

/** Refill status from doses_remaining + schedule density (PRD §9.5). */
export function refillStatus(med: Pick<Medication, "dosesRemaining" | "scheduleTimes" | "scheduleDays" | "prn">): {
  daysLeft: number | null;
  low: boolean;
} {
  if (med.dosesRemaining <= 0) return { daysLeft: med.dosesRemaining === 0 ? 0 : null, low: med.dosesRemaining === 0 };
  if (med.prn) return { daysLeft: null, low: false };
  const perDay = med.scheduleTimes.length || 1;
  const activeDays = med.scheduleDays.length === 0 ? 7 : med.scheduleDays.length;
  // doses per week ÷ 7 → doses per day, on average.
  const dosesPerDay = (perDay * activeDays) / 7;
  const daysLeft = dosesPerDay > 0 ? Math.floor(med.dosesRemaining / dosesPerDay) : null;
  return { daysLeft, low: daysLeft !== null && daysLeft < 7 };
}

/** Variant for an adherence percentage chip (Monograph signal palette). */
export function adherenceVariant(pct: number): "positive" | "monitor" | "danger" {
  if (pct >= 80) return "positive";
  if (pct >= 50) return "monitor";
  return "danger";
}

export const FORM_OPTIONS = ["tablet", "capsule", "liquid", "injection", "patch", "inhaler", "cream", "drops"] as const;
