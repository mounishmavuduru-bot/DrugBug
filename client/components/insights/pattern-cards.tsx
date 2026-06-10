"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { TrendingDown, Link2, AlertCircle } from "lucide-react";
import { Card, CardHeader, CardEyebrow, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingState, EmptyState, ErrorState } from "@/components/shared/states";
import { Disclaimer } from "@/components/med/disclaimer";
import {
  sideEffectPatterns,
  adherenceForecast,
  type Attribution,
  type MissForecast,
} from "@/lib/inference-client";

type LoadState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; message: string };

/** Strength descriptor for a correlation coefficient. */
function strengthOf(r: number): { label: string; variant: "danger" | "caution" | "neutral" } {
  const a = Math.abs(r);
  if (a >= 0.7) return { label: "Strong", variant: "danger" };
  if (a >= 0.4) return { label: "Moderate", variant: "caution" };
  return { label: "Weak", variant: "neutral" };
}

/**
 * PatternFinder side-effect attributions (PRD §10.3). These are statistical
 * correlations surfaced for discussion with a prescriber — explicitly NOT causal.
 */
export function SideEffectPatternsCard({ identityHex }: { identityHex: string }) {
  const [state, setState] = useState<LoadState<Attribution[]>>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!identityHex) return;
    let cancelled = false;
    (async () => {
      setState({ status: "loading" });
      try {
        const { patterns } = await sideEffectPatterns(identityHex);
        if (cancelled) return;
        const sorted = [...patterns].sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
        setState({ status: "ready", data: sorted });
      } catch (e) {
        if (cancelled) return;
        setState({
          status: "error",
          message: e instanceof Error ? e.message : "Could not load patterns.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [identityHex, reloadKey]);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardEyebrow>Symptoms · patterns</CardEyebrow>
          <CardTitle className="mt-1">Symptom and dose patterns</CardTitle>
          <CardDescription>Symptoms that tend to follow a medication in your logs</CardDescription>
        </div>
        <Badge variant="neutral">Correlation</Badge>
      </CardHeader>

      <div className="px-4 py-4">
        {state.status === "loading" ? (
          <LoadingState rows={3} label="Looking for patterns…" />
        ) : state.status === "error" ? (
          <ErrorState
            title="Couldn't check for patterns"
            description={state.message}
            retry={() => setReloadKey((k) => k + 1)}
          />
        ) : state.data.length === 0 ? (
          <EmptyState
            icon={Link2}
            title="Nothing stands out yet"
            description="As you log more doses and side effects, any symptom that consistently follows a medication will be listed here."
          />
        ) : (
          <ul className="divide-y divide-rule border-y border-rule">
            {state.data.map((p, i) => {
              const s = strengthOf(p.r);
              return (
                <li
                  key={`${p.medication}-${p.symptom}-${i}`}
                  className="py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-ink">
                      <span className="label-mono">{p.medication}</span>
                      <span className="text-muted"> is often followed by </span>
                      {p.symptom}
                    </p>
                    <Badge variant={s.variant} className="shrink-0">
                      {s.label}
                    </Badge>
                  </div>
                  <dl className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-muted">
                    <div className="flex items-baseline gap-1.5">
                      <dt className="text-faint">r</dt>
                      <dd className="label-mono tnum text-ink">{p.r.toFixed(2)}</dd>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <dt className="text-faint">logs</dt>
                      <dd className="label-mono tnum text-ink">{p.n}</dd>
                    </div>
                    {p.lagHours ? (
                      <div className="flex items-baseline gap-1.5">
                        <dt className="text-faint">lag</dt>
                        <dd className="label-mono tnum text-ink">{p.lagHours}h</dd>
                      </div>
                    ) : null}
                  </dl>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-3 text-[11px] leading-snug text-muted">
          These are correlations from your own logs, not proof that a medication caused a
          symptom. Bring them up with your prescriber to decide whether they're worth acting on.
        </p>
        <Disclaimer className="mt-2" />
      </div>
    </Card>
  );
}

/**
 * AdherenceForecaster upcoming-miss predictions (PRD §10.3). Only doses with a
 * predicted miss probability above the nudge threshold are surfaced.
 */
const MISS_THRESHOLD = 0.5;

export function ForecastCard({ identityHex }: { identityHex: string }) {
  const [state, setState] = useState<LoadState<MissForecast[]>>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!identityHex) return;
    let cancelled = false;
    (async () => {
      setState({ status: "loading" });
      try {
        const { forecasts } = await adherenceForecast(identityHex);
        if (cancelled) return;
        const flagged = forecasts
          .filter((f) => f.pMiss > MISS_THRESHOLD)
          .sort((a, b) => b.pMiss - a.pMiss);
        setState({ status: "ready", data: flagged });
      } catch (e) {
        if (cancelled) return;
        setState({
          status: "error",
          message: e instanceof Error ? e.message : "Could not load forecast.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [identityHex, reloadKey]);

  const formatWhen = useMemo(
    () => (iso: string) => {
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? iso : format(d, "EEE, MMM d · h:mm a");
    },
    []
  );

  return (
    <Card>
      <CardHeader>
        <div>
          <CardEyebrow>Forecast · miss risk</CardEyebrow>
          <CardTitle className="mt-1">Doses you're likely to miss</CardTitle>
          <CardDescription>Upcoming doses our model flags as above-average risk</CardDescription>
        </div>
        <Badge variant="brand">Forecast</Badge>
      </CardHeader>

      <div className="px-4 py-4">
        {state.status === "loading" ? (
          <LoadingState rows={3} label="Checking upcoming doses…" />
        ) : state.status === "error" ? (
          <ErrorState
            title="Couldn't load the forecast"
            description={state.message}
            retry={() => setReloadKey((k) => k + 1)}
          />
        ) : state.data.length === 0 ? (
          <EmptyState
            icon={TrendingDown}
            title="Nothing flagged right now"
            description="None of your upcoming doses are above the miss-risk threshold."
          />
        ) : (
          <ul className="divide-y divide-rule border-y border-rule">
            {state.data.map((f) => {
              const pct = Math.round(f.pMiss * 100);
              return (
                <li
                  key={f.doseId}
                  className="flex items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-2">
                    <AlertCircle className="size-4 shrink-0 text-monitor" aria-hidden />
                    <p className="text-sm text-ink">{formatWhen(f.scheduledAt)}</p>
                  </div>
                  <Badge variant={pct >= 75 ? "danger" : "caution"} className="shrink-0">
                    <span className="label-mono tnum">{pct}%</span> risk
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}

        <Disclaimer className="mt-3" />
      </div>
    </Card>
  );
}
