"use client";

import { Check, X, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { clockTime, doseStatusStyle, type DoseStatus } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isLate, type DoseWithMed } from "@/components/today/today-utils";

function statusFor(row: DoseWithMed): DoseStatus {
  const s = row.dose.status as DoseStatus;
  // A still-pending dose past its grace window reads as "late" in the timeline.
  if (s === "pending" && isLate(row.scheduledAt)) return "late";
  return s;
}

/**
 * Vertical timeline of today's doses (PRD §9.1). Each row shows med name (mono),
 * strength, scheduled clock time, and a status chip. Pending rows expose
 * Take / Skip actions inline.
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
    <ol className="relative space-y-1.5">
      {rows.map((row) => {
        const status = statusFor(row);
        const style = doseStatusStyle[status];
        const pending = row.dose.status === "pending";
        const busy = busyDoseId === row.dose.doseId;
        const key = row.dose.doseId.toString();

        return (
          <li
            key={key}
            className={cn(
              "surface flex items-center gap-3 rounded-[var(--radius)] border border-border p-3",
              status === "late" && "border-warning/40"
            )}
          >
            <span className="mono flex w-14 shrink-0 items-center gap-1 text-xs text-muted">
              <Clock className="size-3" />
              {clockTime(row.scheduledAt)}
            </span>

            <div className="min-w-0 flex-1">
              <p className="mono truncate text-sm text-text">
                {row.med?.name ?? "Medication"}
              </p>
              {row.med?.strength ? (
                <p className="mono truncate text-xs text-muted">
                  {row.med.strength}
                </p>
              ) : null}
            </div>

            {pending ? (
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSkip(row)}
                  disabled={busy}
                  aria-label={`Skip ${row.med?.name ?? "dose"}`}
                >
                  <X className="size-4" />
                  Skip
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onTake(row)}
                  disabled={busy}
                  aria-label={`Take ${row.med?.name ?? "dose"}`}
                >
                  <Check className="size-4" />
                  Take
                </Button>
              </div>
            ) : (
              <Badge variant={style.variant} className="shrink-0">
                {style.label}
              </Badge>
            )}
          </li>
        );
      })}
    </ol>
  );
}
