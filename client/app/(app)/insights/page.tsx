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
  overallAdherence,
  missedByMedSeries,
  sideEffectScatter,
  scatterDomain,
  buildMedColorMap,
} from "@/components/insights/insights-utils";

/**
 * A ruled section head — a mono reference label and a plain-language note sitting
 * on a hairline rule, like a running head in a printed reference. Gives each
 * section a clear opening edge without three identical free-floating kickers.
 */
function SectionRule({ eyebrow, note }: { eyebrow: string; note: string }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-rule pb-1.5">
      <span className="label-mono text-[11px] uppercase tracking-[0.14em] text-faint">
        {eyebrow}
      </span>
      <span className="h-px flex-1 self-center bg-rule" aria-hidden />
      <span className="hidden text-xs text-muted sm:inline">{note}</span>
    </div>
  );
}

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
  const overall = useMemo(() => overallAdherence(series), [series]);
  const activeCount = useMemo(() => meds.filter((m) => m.active).length, [meds]);

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
          color: c?.color ?? "#6a6052",
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
      <div className="space-y-6">
        <header className="border-b border-rule-strong pb-5">
          <p className="label-mono text-[11px] uppercase tracking-[0.14em] text-faint">
            Last 30 days
          </p>
          <h1 className="mt-1">Your medication record</h1>
        </header>
        <EmptyState
          icon={BarChart3}
          title="Nothing to chart yet"
          description="Add a medication and log a few doses. Your 30-day on-time rate, missed doses, side-effect timing, and miss-risk forecast show up here once there's data to draw from."
          action={
            <Link href="/meds/add" className={buttonVariants({ variant: "primary" })}>
              <Plus className="size-4" /> Add medication
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Masthead — the 30-day on-time figure is the one thing the eye lands on. */}
      <header className="border-b border-rule-strong pb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="label-mono text-[11px] uppercase tracking-[0.14em] text-faint">
              Last 30 days
            </p>
            <h1 className="mt-1">Your medication record</h1>
          </div>
          <Link
            href="/insights/brief"
            className={`${buttonVariants({ variant: "secondary", size: "sm" })} shrink-0`}
          >
            <FileText className="size-4" /> Appointment brief
          </Link>
        </div>

        <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {overall !== null ? (
            <>
              <span className="font-display text-6xl leading-none tracking-tight tnum text-ink">
                {overall}%
              </span>
              <span className="text-sm text-muted">
                of scheduled doses taken on time
              </span>
            </>
          ) : (
            <span className="font-display text-2xl text-muted">
              No doses logged in this window yet
            </span>
          )}
        </div>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
          Drawn from{" "}
          <span className="label-mono tnum text-ink">{activeCount}</span>{" "}
          {activeCount === 1 ? "active medication" : "active medications"} and every dose and side
          effect you&apos;ve logged. The charts below show how each day went and which symptoms line
          up with which medication.
        </p>
      </header>

      {/* Schedule — how the days actually went. The two dose charts read as one
          spread, so they sit close together under a single ruled section head. */}
      <section className="space-y-4">
        <SectionRule eyebrow="Schedule" note="What you took, and when" />
        <AdherenceChart series={series} />
        <MissedDosesChart data={missedData} meds={missedMedEntries} />
      </section>

      {/* Symptoms — what you felt, and what it lines up with. */}
      <section className="space-y-4">
        <SectionRule eyebrow="Symptoms" note="What you felt, and what it follows" />
        <SideEffectScatter series={scatterSeries} unattributed={unattributed} domain={domain} />
        <SideEffectPatternsCard identityHex={hex} />
      </section>

      {/* Ahead — what the model expects next. A single card, given more room above
          so the forecast reads as its own quiet closing note rather than a third
          identical block. */}
      <section className="space-y-4 pt-2">
        <SectionRule eyebrow="Looking ahead" note="Doses the model flags as at-risk" />
        <ForecastCard identityHex={hex} />
      </section>
    </div>
  );
}
