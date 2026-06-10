"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarCheck, Plus } from "lucide-react";
import { useReducer } from "spacetimedb/react";
import { reducers, identityHex } from "@/lib/db";
import { useMyIdentity, useMyMeds, useMyProfile, useDoses } from "@/lib/hooks";
import { adherenceForecast } from "@/lib/inference-client";
import { dayLabel } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { LoadingState, EmptyState, ErrorState } from "@/components/shared/states";
import { TodayHero } from "@/components/today/today-hero";
import { DoseTimeline } from "@/components/today/dose-timeline";
import { NudgeBanner } from "@/components/today/nudge-banner";
import { RefillStrip } from "@/components/today/refill-strip";
import { MissedDoseModal } from "@/components/today/missed-dose-modal";
import {
  todaysDoses,
  nextPending,
  isLate,
  type DoseWithMed,
  type Medication,
} from "@/components/today/today-utils";

export default function TodayPage() {
  const me = useMyIdentity();
  const { profile } = useMyProfile();
  const { meds, ready: medsReady } = useMyMeds();
  const { doses, ready: dosesReady } = useDoses();

  const logDose = useReducer(reducers.logDose);

  const [busyDoseId, setBusyDoseId] = useState<bigint | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [recoveryFor, setRecoveryFor] = useState<DoseWithMed | null>(null);
  const [forecasts, setForecasts] = useState<Record<string, number>>({});
  const [dismissedNudges, setDismissedNudges] = useState<Set<string>>(new Set());

  const activeMeds = useMemo(
    () => meds.filter((m) => m.active),
    [meds]
  );

  const rows = useMemo(
    () => todaysDoses(doses, meds),
    [doses, meds]
  );

  const next = useMemo(() => nextPending(rows), [rows]);

  // Label for the chart date. Memoized so it's stable within a render pass.
  const today = useMemo(() => new Date(), []);

  // ---- predictive nudge (best-effort; ok if the service is unreachable) ----
  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    (async () => {
      try {
        const { forecasts: fc } = await adherenceForecast(identityHex(me));
        if (cancelled) return;
        const map: Record<string, number> = {};
        for (const f of fc) map[f.doseId] = f.pMiss;
        setForecasts(map);
      } catch {
        // Forecast is a nicety, not a requirement — silently ignore failures.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me]);

  // The first upcoming pending dose with a >50% predicted miss probability.
  const nudge = useMemo(() => {
    const hit = rows.find((row) => {
      if (row.dose.status !== "pending") return false;
      if (isLate(row.scheduledAt)) return false; // pre-emptive = still upcoming
      const id = row.dose.doseId.toString();
      if (dismissedNudges.has(id)) return false;
      const pMiss = forecasts[id];
      return typeof pMiss === "number" && pMiss > 0.5;
    });
    if (!hit) return null;
    const id = hit.dose.doseId.toString();
    return { row: hit, pMiss: forecasts[id], id };
  }, [rows, forecasts, dismissedNudges]);

  const handleTake = useCallback(
    async (row: DoseWithMed) => {
      setBusyDoseId(row.dose.doseId);
      setError(null);
      try {
        const status = isLate(row.scheduledAt) ? "late" : "taken";
        await logDose({ doseId: row.dose.doseId, status, notes: "" });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not log this dose.");
      } finally {
        setBusyDoseId(undefined);
      }
    },
    [logDose]
  );

  const openSkip = useCallback((row: DoseWithMed) => {
    setRecoveryFor(row);
  }, []);

  const confirmSkip = useCallback(async () => {
    const row = recoveryFor;
    if (!row) return;
    setBusyDoseId(row.dose.doseId);
    setError(null);
    try {
      await logDose({ doseId: row.dose.doseId, status: "skipped", notes: "" });
      setRecoveryFor(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not skip this dose.");
    } finally {
      setBusyDoseId(undefined);
    }
  }, [logDose, recoveryFor]);

  // ---- states ----
  if (!medsReady || !dosesReady) {
    return <LoadingState label="Loading your day…" />;
  }

  if (activeMeds.length === 0) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="Your chart is empty"
        description="Add a medication and your day fills in here — every dose, when it's due, and what's running low."
        action={
          <Link href="/meds/add">
            <Button variant="primary" size="md">
              <Plus className="size-4" strokeWidth={1.75} />
              Add a medication
            </Button>
          </Link>
        }
      />
    );
  }

  const recoveryMed: Medication | undefined = recoveryFor?.med;

  const dueCount = rows.filter((r) => r.dose.status === "pending").length;

  return (
    <div className="space-y-8">
      <TodayHero
        name={profile?.fullName}
        next={next}
        onTake={handleTake}
        taking={busyDoseId !== undefined}
      />

      {nudge ? (
        <NudgeBanner
          row={nudge.row}
          pMiss={nudge.pMiss}
          onDismiss={() =>
            setDismissedNudges((prev) => {
              const set = new Set(prev);
              set.add(nudge.id);
              return set;
            })
          }
        />
      ) : null}

      {error ? (
        <ErrorState
          title="That dose didn’t save"
          description={error}
          retry={() => setError(null)}
        />
      ) : null}

      <section aria-label="Today’s dose chart" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="label-mono text-[11px] uppercase tracking-[0.16em] text-muted">
            Dose chart
            {dueCount > 0 ? (
              <span className="ml-2 text-ink">
                {dueCount} <span className="text-muted">still due</span>
              </span>
            ) : (
              <span className="ml-2 text-positive">all marked</span>
            )}
          </h2>
          <span
            className="label-mono tnum text-xs text-muted"
            suppressHydrationWarning
          >
            {dayLabel(today)}
          </span>
        </div>
        {rows.length === 0 ? (
          <EmptyState
            icon={CalendarCheck}
            title="No doses scheduled today"
            description="None of your active medications fall on today. PRN medications don’t appear here until you log them from the meds list."
          />
        ) : (
          <DoseTimeline
            rows={rows}
            onTake={handleTake}
            onSkip={openSkip}
            busyDoseId={busyDoseId}
          />
        )}
      </section>

      <RefillStrip meds={activeMeds} />

      <MissedDoseModal
        open={recoveryFor !== null}
        onClose={() => setRecoveryFor(null)}
        med={recoveryMed}
        onSkipConfirmed={confirmSkip}
      />
    </div>
  );
}
