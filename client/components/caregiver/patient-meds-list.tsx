"use client";

import { Clock, Pill } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { relativeTo } from "@/lib/format";
import {
  scheduleSummary,
  lastTaken,
  adherence7d,
  adherenceVariant,
  refillStatus,
} from "@/components/med/med-utils";
import { EmptyState } from "@/components/shared/states";
import type { Medication, Dose } from "@/components/caregiver/caregiver-utils";

/**
 * Read-only medication list for the caregiver "manage" view. The owner's /meds
 * route is scoped to the signed-in identity, so caregivers get a dedicated,
 * patient-scoped rendering here (built from usePatientMeds + useDoses).
 */
export function PatientMedsList({
  meds,
  doses,
}: {
  meds: readonly Medication[];
  doses: readonly Dose[];
}) {
  const active = meds.filter((m) => m.active);
  if (active.length === 0) {
    return (
      <EmptyState
        icon={Pill}
        title="No active medications"
        description="This patient has no active medications to show."
      />
    );
  }

  return (
    <ul className="space-y-2">
      {active.map((med) => {
        const last = lastTaken(doses, med.medId);
        const adh = adherence7d(doses, med.medId);
        const refill = refillStatus(med);
        return (
          <li
            key={med.medId.toString()}
            className="rounded-[var(--radius)] border border-border bg-elevated p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mono truncate text-sm font-semibold text-text">{med.name}</span>
                  {med.strength ? <span className="mono text-xs text-muted">{med.strength}</span> : null}
                  {med.isOtc ? <Badge variant="neutral">OTC</Badge> : null}
                  {med.prn ? <Badge variant="neutral">PRN</Badge> : null}
                </div>
                <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                  <Clock className="size-3" />
                  {scheduleSummary(med)}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                  <span>Last taken: {last ? relativeTo(last) : "never"}</span>
                  {refill.low && refill.daysLeft !== null ? (
                    <span className="text-warning">
                      Refill: {refill.daysLeft === 0 ? "out of doses" : `~${refill.daysLeft}d left`}
                    </span>
                  ) : null}
                </div>
              </div>
              {adh ? (
                <div className="shrink-0 text-right">
                  <Badge variant={adherenceVariant(adh.pct)}>{adh.pct}%</Badge>
                  <p className="mt-1 text-[10px] text-muted">7-day</p>
                </div>
              ) : (
                <span className="shrink-0 text-[10px] text-muted">No 7-day data</span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
