"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { TrendingDown, Link2, AlertCircle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
function strengthOf(r: number): { label: string; variant: "danger" | "warning" | "neutral" } {
  const a = Math.abs(r);
  if (a >= 0.7) return { label: "Strong", variant: "danger" };
  if (a >= 0.4) return { label: "Moderate", variant: "warning" };
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
          <CardTitle>Side-effect patterns</CardTitle>
          <CardDescription>Statistical associations between doses and logged symptoms</CardDescription>
        </div>
        <Badge variant="neutral">Correlational</Badge>
      </CardHeader>

      {state.status === "loading" ? (
        <LoadingState label="Analyzing patterns…" />
      ) : state.status === "error" ? (
        <ErrorState
          title="Patterns unavailable"
          description={state.message}
          retry={() => setReloadKey((k) => k + 1)}
        />
      ) : state.data.length === 0 ? (
        <EmptyState
          icon={Link2}
          title="No significant associations yet"
          description="As you log more doses and side effects, correlations will surface here."
        />
      ) : (
        <ul className="space-y-2.5">
          {state.data.map((p, i) => {
            const s = strengthOf(p.r);
            return (
              <li
                key={`${p.medication}-${p.symptom}-${i}`}
                className="rounded-[var(--radius)] border border-border bg-elevated/40 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-text">
                    <span className="font-medium">{p.symptom}</span>
                    <span className="text-muted"> associate with </span>
                    <span className="mono">{p.medication}</span>
                  </p>
                  <Badge variant={s.variant} className="shrink-0">
                    {s.label}
                  </Badge>
                </div>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span>
                    r = <span className="mono text-text">{p.r.toFixed(2)}</span>
                  </span>
                  <span>
                    n = <span className="mono text-text">{p.n}</span>
                  </span>
                  {p.lagHours ? (
                    <span>
                      lag <span className="mono text-text">{p.lagHours}h</span>
                    </span>
                  ) : null}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-3 text-[11px] leading-snug text-muted">
        These are correlations, not causal claims. Share them with your prescriber to
        discuss whether a medication may be contributing to a symptom.
      </p>
      <Disclaimer className="mt-2" />
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
          <CardTitle>Predicted upcoming misses</CardTitle>
          <CardDescription>Scheduled doses at elevated risk of being missed</CardDescription>
        </div>
        <Badge variant="primary">Forecast</Badge>
      </CardHeader>

      {state.status === "loading" ? (
        <LoadingState label="Forecasting adherence…" />
      ) : state.status === "error" ? (
        <ErrorState
          title="Forecast unavailable"
          description={state.message}
          retry={() => setReloadKey((k) => k + 1)}
        />
      ) : state.data.length === 0 ? (
        <EmptyState
          icon={TrendingDown}
          title="No high-risk doses predicted"
          description="No upcoming doses are above the miss-risk threshold right now."
        />
      ) : (
        <ul className="space-y-2.5">
          {state.data.map((f) => {
            const pct = Math.round(f.pMiss * 100);
            return (
              <li
                key={f.doseId}
                className="flex items-center justify-between gap-2 rounded-[var(--radius)] border border-border bg-elevated/40 p-3"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="size-4 shrink-0 text-warning" aria-hidden />
                  <p className="text-sm text-text">{formatWhen(f.scheduledAt)}</p>
                </div>
                <Badge variant={pct >= 75 ? "danger" : "warning"} className="shrink-0">
                  <span className="mono">{pct}%</span> miss risk
                </Badge>
              </li>
            );
          })}
        </ul>
      )}

      <Disclaimer className="mt-3" />
    </Card>
  );
}
