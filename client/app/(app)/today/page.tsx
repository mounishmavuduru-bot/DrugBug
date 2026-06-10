"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarCheck, Plus } from "lucide-react";
import { useReducer } from "spacetimedb/react";
import { reducers, identityHex } from "@/lib/db";
import { useMyIdentity, useMyMeds, useMyProfile, useDoses } from "@/lib/hooks";
import { adherenceForecast } from "@/lib/inference-client";
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
        title="No medications yet"
        description="Add your first medication to start tracking doses, reminders, and refills."
        action={
          <Link href="/meds/add">
            <Button variant="primary" size="md">
              <Plus className="size-4" />
              Add medication
            </Button>
          </Link>
        }
      />
    );
  }

  const recoveryMed: Medication | undefined = recoveryFor?.med;

  return (
    <div className="space-y-5">
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
          title="Couldn’t update that dose"
          description={error}
          retry={() => setError(null)}
        />
      ) : null}

      <section aria-label="Today’s schedule" className="space-y-2">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
          Today’s schedule
        </h2>
        {rows.length === 0 ? (
          <EmptyState
            icon={CalendarCheck}
            title="Nothing scheduled today"
            description="Your active medications have no doses scheduled for today."
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
