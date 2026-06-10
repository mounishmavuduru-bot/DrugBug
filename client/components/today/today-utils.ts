// Shared helpers for the Today screen (PRD §9.1/§9.2/§10.3). Pure functions so
// they can be unit-reasoned about without React.

import type { Infer } from "spacetimedb";
import medicationsRow from "@/lib/spacetime/medications_table";
import dosesRow from "@/lib/spacetime/doses_table";
import { tsToDate } from "@/lib/format";

export type Medication = Infer<typeof medicationsRow>;
export type Dose = Infer<typeof dosesRow>;

/** A dose paired with its medication (may be missing if the med was removed). */
export interface DoseWithMed {
  dose: Dose;
  med?: Medication;
  scheduledAt: Date | null;
}

/** Minutes past scheduled time after which a "taken" dose is logged as "late". */
export const GRACE_MINUTES = 60;

/** True if `now` is more than the grace window past the scheduled time. */
export function isLate(scheduledAt: Date | null, now: Date = new Date()): boolean {
  if (!scheduledAt) return false;
  return now.getTime() - scheduledAt.getTime() > GRACE_MINUTES * 60_000;
}

/** Same calendar day in local time. */
export function isSameDay(a: Date | null, b: Date): boolean {
  return (
    !!a &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Join + filter doses to today, sorted by scheduled time. */
export function todaysDoses(
  doses: readonly Dose[],
  meds: readonly Medication[],
  now: Date = new Date()
): DoseWithMed[] {
  const medById = new Map<string, Medication>();
  for (const m of meds) medById.set(m.medId.toString(), m);

  return doses
    .map((dose) => ({
      dose,
      med: medById.get(dose.medId.toString()),
      scheduledAt: tsToDate(dose.scheduledAt),
    }))
    .filter((d) => isSameDay(d.scheduledAt, now))
    .sort(
      (a, b) =>
        (a.scheduledAt?.getTime() ?? 0) - (b.scheduledAt?.getTime() ?? 0)
    );
}

/** The next still-pending dose (earliest scheduled time today). */
export function nextPending(rows: DoseWithMed[]): DoseWithMed | undefined {
  return rows.find((r) => r.dose.status === "pending");
}

/**
 * Estimate days of supply left from dosesRemaining and how many times a day the
 * med is taken. PRN / scheduleless meds return null (no projection).
 */
export function daysOfSupply(med: Medication): number | null {
  if (med.prn) return null;
  const perDay = med.scheduleTimes.length;
  if (perDay <= 0) return null;
  if (med.dosesRemaining < 0) return null;
  return Math.floor(med.dosesRemaining / perDay);
}

/** Pull a phone number out of the free-text pharmacy field, if one is present. */
export function pharmacyPhone(pharmacy: string | undefined): string | null {
  if (!pharmacy) return null;
  const m = pharmacy.match(
    /(\+?\d[\d\s().-]{6,}\d)/ // loose: at least 8 phone-ish chars
  );
  if (!m) return null;
  const digits = m[1].replace(/[^\d+]/g, "");
  return digits.length >= 7 ? digits : null;
}
