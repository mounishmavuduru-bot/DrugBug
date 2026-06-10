"use client";

import { useMemo } from "react";
import Link from "next/link";
import { BarChart3, FileText, Plus } from "lucide-react";

import { identityHex } from "@/lib/db";
import { useMyIdentity, useMyMeds, useDoses, useSideEffects } from "@/lib/hooks";

import { buttonVariants } from "@/components/ui/button";
import { LoadingState, EmptyState } from "@/components/shared/states";

import { AdherenceChart } from "@/components/insights/adherence-chart";
import { MissedDosesChart } from "@/components/insights/missed-doses-chart";
import { SideEffectScatter } from "@/components/insights/side-effect-scatter";
import { SideEffectPatternsCard, ForecastCard } from "@/components/insights/pattern-cards";
import {
  adherenceSeries,
  missedByMedSeries,
  sideEffectScatter,
  scatterDomain,
  buildMedColorMap,
} from "@/components/insights/insights-utils";

export default function InsightsPage() {
  const me = useMyIdentity();
  const { meds, ready: medsReady } = useMyMeds();
  const { doses, ready: dosesReady } = useDoses();
  const { sideEffects, ready: seReady } = useSideEffects();

  const hex = useMemo(() => identityHex(me), [me]);

  // Color/label map keyed by every med the user has (active first, then the rest)
  // so historical doses/side-effects from deactivated meds still get a stable color.
  const orderedMeds = useMemo(
    () => [...meds].sort((a, b) => Number(b.active) - Number(a.active)),
    [meds]
  );
  const medColorMap = useMemo(() => buildMedColorMap(orderedMeds), [orderedMeds]);

  const series = useMemo(() => adherenceSeries(doses), [doses]);

  const medIds = useMemo(() => orderedMeds.map((m) => m.medId.toString()), [orderedMeds]);

  const missedData = useMemo(() => missedByMedSeries(doses, medIds), [doses, medIds]);

  // Only include meds that actually have a missed dose in the chart's legend/bars.
  const missedMedEntries = useMemo(() => {
    const present = new Set<string>();
    for (const row of missedData) {
      for (const id of medIds) if ((row[id] as number) > 0) present.add(id);
    }
    return medIds
      .filter((id) => present.has(id))
      .map((id) => {
        const c = medColorMap.get(id)!;
        return { id, label: c.label, color: c.color };
      });
  }, [missedData, medIds, medColorMap]);

  const { byMed, unattributed } = useMemo(() => sideEffectScatter(sideEffects), [sideEffects]);

  const scatterSeries = useMemo(
    () =>
      [...byMed.entries()].map(([id, points]) => {
        const c = medColorMap.get(id);
        return {
          id,
          label: c?.label ?? `Med ${id}`,
          color: c?.color ?? "#94a3b8",
          points,
        };
      }),
    [byMed, medColorMap]
  );

  const domain = useMemo(() => scatterDomain(), []);

  if (!medsReady || !dosesReady || !seReady) {
    return <LoadingState label="Loading insights…" />;
  }

  if (meds.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No insights yet"
        description="Add medications and start logging doses and side effects to unlock adherence trends, miss forecasts, and side-effect patterns."
        action={
          <Link href="/meds/add" className={buttonVariants({ variant: "primary" })}>
            <Plus className="size-4" /> Add medication
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Insights</h1>
          <p className="text-xs text-muted">
            Adherence trends, miss forecasts, and side-effect patterns.
          </p>
        </div>
        <Link href="/insights/brief" className={buttonVariants({ variant: "secondary" })}>
          <FileText className="size-4" /> Appointment brief
        </Link>
      </header>

      <AdherenceChart series={series} />

      <MissedDosesChart data={missedData} meds={missedMedEntries} />

      <SideEffectScatter series={scatterSeries} unattributed={unattributed} domain={domain} />

      <div className="grid gap-5">
        <ForecastCard identityHex={hex} />
        <SideEffectPatternsCard identityHex={hex} />
      </div>
    </div>
  );
}
