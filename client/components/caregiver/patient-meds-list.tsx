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
 * patient-scoped rendering here (built from usePatientMeds + useDoses). Reads
 * like a formulary index: ruled rows, drug names in label-mono, 7-day adherence
 * as a small figure on the right.
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
        description="This patient has no active medications to show right now."
      />
    );
  }

  return (
    <ul className="divide-y divide-rule rounded-[var(--radius-sm)] border border-rule bg-card">
      {active.map((med) => {
        const last = lastTaken(doses, med.medId);
        const adh = adherence7d(doses, med.medId);
        const refill = refillStatus(med);
        return (
          <li key={med.medId.toString()} className="px-3.5 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="label-mono truncate text-sm font-semibold text-ink">
                    {med.name}
                  </span>
                  {med.strength ? (
                    <span className="label-mono text-xs text-muted">{med.strength}</span>
                  ) : null}
                  {med.isOtc ? <Badge variant="outline">OTC</Badge> : null}
                  {med.prn ? <Badge variant="outline">PRN</Badge> : null}
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                  <Clock className="size-3" strokeWidth={1.75} />
                  {scheduleSummary(med)}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                  <span>Last taken {last ? relativeTo(last) : "never"}</span>
                  {refill.low && refill.daysLeft !== null ? (
                    <span className="text-caution">
                      {refill.daysLeft === 0 ? "Out of doses" : `Refill in ~${refill.daysLeft}d`}
                    </span>
                  ) : null}
                </div>
              </div>
              {adh ? (
                <div className="shrink-0 text-right">
                  <Badge variant={adherenceVariant(adh.pct)}>
                    <span className="tnum">{adh.pct}%</span>
                  </Badge>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-faint">7-day</p>
                </div>
              ) : (
                <span className="shrink-0 text-[10px] text-faint">No 7-day data</span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
