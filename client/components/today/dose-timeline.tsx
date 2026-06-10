"use client";

import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { clockTime, doseStatusStyle, type DoseStatus } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isLate, type DoseWithMed } from "@/components/today/today-utils";

function statusFor(row: DoseWithMed): DoseStatus {
  const s = row.dose.status as DoseStatus;
  // A still-pending dose past its grace window reads as "late" in the chart.
  if (s === "pending" && isLate(row.scheduledAt)) return "late";
  return s;
}

/**
 * The day as a medication-administration chart (PRD §9.1). A ruled time column
 * runs down the left like a paper MAR; drug names sit in prescription-label
 * mono with strength beneath; each row ends in a status chip or inline
 * Take / Skip. Rows that still need action are held in ink; settled rows recede
 * to muted. One staggered .rise on load — no per-row animation beyond that.
 */
export function DoseTimeline({
  rows,
  onTake,
  onSkip,
  busyDoseId,
}: {
  rows: DoseWithMed[];
  onTake: (row: DoseWithMed) => void;
  onSkip: (row: DoseWithMed) => void;
  busyDoseId?: bigint;
}) {
  return (
    <ol className="overflow-hidden rounded-[var(--radius-md)] border border-rule bg-card">
      {rows.map((row, i) => {
        const status = statusFor(row);
        const style = doseStatusStyle[status];
        const pending = row.dose.status === "pending";
        const settled = !pending; // taken / skipped / missed — recedes
        const busy = busyDoseId === row.dose.doseId;
        const key = row.dose.doseId.toString();

        return (
          <li
            key={key}
            className={cn(
              "rise flex items-stretch border-b border-rule",
              status === "late" && "bg-monitor-tint"
            )}
            style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
          >
            {/* Ruled time gutter — the MAR column. */}
            <span
              className={cn(
                "label-mono tnum flex w-[4.5rem] shrink-0 items-center justify-end border-r border-rule px-3 py-4 text-sm",
                pending ? "text-ink" : "text-faint"
              )}
            >
              {clockTime(row.scheduledAt)}
            </span>

            <div className="flex flex-1 items-center gap-3 py-3 pl-4">
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "label-mono truncate text-sm",
                    settled ? "text-muted" : "text-ink"
                  )}
                >
                  {row.med?.name ?? "Medication"}
                </p>
                {row.med?.strength ? (
                  <p className="label-mono truncate text-xs text-faint">
                    {row.med.strength}
                  </p>
                ) : null}
              </div>

              {pending ? (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="quiet"
                    size="sm"
                    onClick={() => onSkip(row)}
                    disabled={busy}
                    aria-label={`Skip ${row.med?.name ?? "dose"}`}
                  >
                    <X className="size-4" strokeWidth={1.75} />
                    Skip
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => onTake(row)}
                    disabled={busy}
                    aria-label={`Mark ${row.med?.name ?? "dose"} as taken`}
                  >
                    <Check className="size-4" strokeWidth={1.75} />
                    Take
                  </Button>
                </div>
              ) : (
                <Badge variant={style.variant} className="shrink-0">
                  {style.label}
                </Badge>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
