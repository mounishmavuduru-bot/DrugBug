"use client";

import Link from "next/link";
import { ChevronRight, Clock, PauseCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { relativeTo } from "@/lib/format";
import {
  type Medication,
  type Dose,
  scheduleSummary,
  lastTaken,
  adherence7d,
  adherenceVariant,
  refillStatus,
} from "@/components/med/med-utils";

/**
 * MedCard (PRD §9.3): name (mono), strength, schedule summary, last-taken,
 * 7-day adherence %. Links to the detail screen.
 */
export function MedCard({ med, doses }: { med: Medication; doses: readonly Dose[] }) {
  const last = lastTaken(doses, med.medId);
  const adh = adherence7d(doses, med.medId);
  const refill = refillStatus(med);

  return (
    <Link
      href={`/meds/${med.medId.toString()}`}
      className="surface flex items-center gap-3 rounded-[var(--radius)] border border-border p-4 transition-fast hover:border-primary/40"
      aria-label={`${med.name} ${med.strength} details`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mono truncate text-sm font-semibold text-text">{med.name}</span>
          {med.strength ? <span className="mono text-xs text-muted">{med.strength}</span> : null}
          {!med.active ? (
            <Badge variant="neutral">
              <PauseCircle className="size-3" /> Inactive
            </Badge>
          ) : null}
          {med.isOtc ? <Badge variant="neutral">OTC</Badge> : null}
          {med.prn ? <Badge variant="neutral">PRN</Badge> : null}
        </div>

        <p className="mt-1 flex items-center gap-1 text-xs text-muted">
          <Clock className="size-3" />
          {scheduleSummary(med)}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
          <span>Last taken: {last ? relativeTo(last) : "never"}</span>
          {refill.low && refill.daysLeft !== null ? (
            <span className="text-warning">
              Refill: {refill.daysLeft === 0 ? "out of doses" : `~${refill.daysLeft}d left`}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {adh ? (
          <div className="text-right">
            <Badge variant={adherenceVariant(adh.pct)}>{adh.pct}%</Badge>
            <p className="mt-1 text-[10px] text-muted">7-day adherence</p>
          </div>
        ) : (
          <span className="text-[10px] text-muted">No 7-day data</span>
        )}
        <ChevronRight className="size-4 text-muted" />
      </div>
    </Link>
  );
}
