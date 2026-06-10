"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
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
 * One ruled row in the formulary index. Reads like a drug-reference entry:
 * name in label-mono, strength, a one-line schedule summary, and the 7-day
 * adherence figure pinned to the right. The whole row links to the monograph.
 */
export function MedRow({ med, doses }: { med: Medication; doses: readonly Dose[] }) {
  const last = lastTaken(doses, med.medId);
  const adh = adherence7d(doses, med.medId);
  const refill = refillStatus(med);

  return (
    <Link
      href={`/meds/${med.medId.toString()}`}
      className="flex items-center gap-4 px-4 py-3.5 transition-colors duration-150 ease-[var(--ease)] hover:bg-brand-tint focus-visible:bg-brand-tint"
      aria-label={`${med.name} ${med.strength} — open monograph`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="label-mono truncate text-[15px] font-medium text-ink">{med.name}</span>
          {med.strength ? <span className="label-mono text-xs text-muted">{med.strength}</span> : null}
          {!med.active ? <Badge variant="outline">Inactive</Badge> : null}
          {med.isOtc ? <Badge variant="neutral">OTC</Badge> : null}
          {med.prn ? <Badge variant="neutral">PRN</Badge> : null}
        </div>

        <p className="mt-1 truncate text-xs text-muted">{scheduleSummary(med)}</p>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-faint">
          <span>Last taken {last ? relativeTo(last) : "never"}</span>
          {refill.low && refill.daysLeft !== null ? (
            <span className="text-caution">
              {refill.daysLeft === 0 ? "Out of doses" : `About ${refill.daysLeft} days of supply left`}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <div className="text-right">
          {adh ? (
            <>
              <Badge variant={adherenceVariant(adh.pct)}>
                <span className="tnum">{adh.pct}%</span>
              </Badge>
              <p className="mt-1 label-mono text-[10px] tnum text-faint">
                {adh.taken}/{adh.scheduled} on time
              </p>
            </>
          ) : (
            <span className="label-mono text-[10px] uppercase tracking-[0.1em] text-faint">No data</span>
          )}
        </div>
        <ChevronRight className="size-4 text-faint" strokeWidth={1.75} aria-hidden />
      </div>
    </Link>
  );
}
