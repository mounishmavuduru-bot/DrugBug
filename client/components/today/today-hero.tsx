"use client";

import { useEffect, useState } from "react";
import { Check, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
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
 * with a live countdown + a one-tap Take action. The next dose is the dominant
 * element on the day — the drug name reads at display size, with the countdown
 * as the headline figure.
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
    <header className="border-b border-rule-strong pb-6">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-muted">
          {greeting(now)}
          {firstName ? <span className="text-ink">, {firstName}</span> : null}
        </p>
        <time
          className="label-mono tnum text-xs text-muted"
          dateTime={now.toISOString()}
          suppressHydrationWarning
        >
          {clockTime(now)}
        </time>
      </div>

      {next ? (
        <div className="mt-4">
          <p className="label-mono text-[11px] uppercase tracking-[0.16em] text-muted">
            {late ? "Overdue dose" : "Next dose"}
          </p>

          {/* Dominant line: the countdown is the day's headline figure — the
              one element carried in brand magenta. Overdue keeps its signal. */}
          <h1 className="mt-2 whitespace-nowrap font-display text-[2.75rem] leading-[0.95] tracking-tight text-brand">
            {late ? (
              <span className="text-caution">Overdue</span>
            ) : (
              <span className="tnum">{countdown(next.scheduledAt)}</span>
            )}
          </h1>

          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="label-mono truncate text-base text-ink">
                {next.med?.name ?? "Medication"}
                {next.med?.strength ? (
                  <span className="text-muted"> · {next.med.strength}</span>
                ) : null}
              </p>
              <p className="label-mono mt-1 inline-flex items-center gap-1.5 text-xs text-muted">
                <Clock className="size-3.5" strokeWidth={1.75} aria-hidden />
                scheduled {clockTime(next.scheduledAt)}
              </p>
            </div>
            <Button
              variant="primary"
              size="lg"
              onClick={() => onTake(next)}
              disabled={taking}
              className="shrink-0"
              aria-label={`Mark ${next.med?.name ?? "next dose"} as taken`}
            >
              <Check className="size-4" strokeWidth={1.75} />
              Take it now
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <h1 className="font-display text-3xl leading-tight text-ink">
            You&apos;re clear for the rest of today
          </h1>
          <span className="mt-2 block h-0.5 w-10 rounded-[var(--radius-pill)] bg-brand" aria-hidden />
          <p className="mt-3 text-sm text-muted">
            Nothing else is due. Doses you&apos;ve already taken are in the chart below.
          </p>
        </div>
      )}
    </header>
  );
}
