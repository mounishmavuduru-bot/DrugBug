"use client";

import { useEffect, useState } from "react";
import { Check, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { clockTime, countdown } from "@/lib/format";
import { isLate, type DoseWithMed } from "@/components/today/today-utils";

function greeting(d: Date): string {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * Today hero (PRD §9.1): greeting, live current time, and the next pending dose
 * with a live countdown + a one-tap Take action.
 */
export function TodayHero({
  name,
  next,
  onTake,
  taking,
}: {
  name?: string;
  next?: DoseWithMed;
  onTake: (row: DoseWithMed) => void;
  taking: boolean;
}) {
  // Re-render every 30s so the clock + countdown stay live.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const firstName = name?.trim().split(/\s+/)[0];
  const late = next ? isLate(next.scheduledAt, now) : false;

  return (
    <div className="surface rounded-[var(--radius)] border border-border p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight text-text">
          {greeting(now)}
          {firstName ? <span className="text-muted">, {firstName}</span> : null}
        </h1>
        <time
          className="mono text-sm text-muted"
          dateTime={now.toISOString()}
          suppressHydrationWarning
        >
          {clockTime(now)}
        </time>
      </div>

      {next ? (
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted">Next dose</p>
            <p className="mono mt-0.5 truncate text-sm text-text">
              {next.med?.name ?? "Medication"}
              {next.med?.strength ? (
                <span className="text-muted"> · {next.med.strength}</span>
              ) : null}
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="mono inline-flex items-center gap-1 text-xs text-muted">
                <Clock className="size-3" />
                {clockTime(next.scheduledAt)}
              </span>
              <Badge variant={late ? "warning" : "primary"}>
                {late ? "Overdue" : countdown(next.scheduledAt)}
              </Badge>
            </div>
          </div>
          <Button
            variant="primary"
            size="md"
            onClick={() => onTake(next)}
            disabled={taking}
            aria-label={`Take ${next.med?.name ?? "next dose"}`}
          >
            <Check className="size-4" />
            Take
          </Button>
        </div>
      ) : (
        <p className="mono mt-4 text-sm text-muted">
          No more pending doses today.
        </p>
      )}
    </div>
  );
}
