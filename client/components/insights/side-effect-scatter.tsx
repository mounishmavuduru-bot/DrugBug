"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { format } from "date-fns";
import { Stethoscope } from "lucide-react";
import { Card, CardHeader, CardEyebrow, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/states";
import { MedLegend } from "@/components/insights/med-legend";
import type { ScatterPoint } from "@/components/insights/insights-utils";

// Brand chart palette — hairline pink grid, muted axis on a white card.
const GRID = "#f3d9e1";
const AXIS = "#6f5b62";
const UNATTRIBUTED_COLOR = "#a98e97"; // faint warm grey — no med attribution

interface SeriesEntry {
  id: string;
  label: string;
  color: string;
  points: ScatterPoint[];
}

function ScatterTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: ScatterPoint & { _med?: string } }[];
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="rounded-[var(--radius-sm)] border border-rule-strong bg-card px-3 py-2 text-xs">
      <p className="font-medium text-ink">{p.symptom}</p>
      <p className="text-muted">
        Severity <span className="label-mono tnum text-ink">{p.severity}/5</span>
      </p>
      <p className="text-muted">{p.when}</p>
      {p._med ? <p className="label-mono text-ink">{p._med}</p> : null}
    </div>
  );
}

/**
 * Side-effect severity over time, one series per medication (PRD §10.3).
 * x = time, y = severity (1..5), color = med. Unattributed logs render grey.
 */
export function SideEffectScatter({
  series,
  unattributed,
  domain,
}: {
  series: SeriesEntry[];
  unattributed: ScatterPoint[];
  domain: [number, number];
}) {
  const hasData = useMemo(
    () => unattributed.length > 0 || series.some((s) => s.points.length > 0),
    [series, unattributed]
  );

  const legendEntries = useMemo(
    () => series.filter((s) => s.points.length > 0).map(({ id, label, color }) => ({ id, label, color })),
    [series]
  );

  return (
    <Card>
      <CardHeader>
        <div>
          <CardEyebrow>Symptoms · severity</CardEyebrow>
          <CardTitle className="mt-1">Side effects over time</CardTitle>
          <CardDescription>
            One dot per logged symptom, placed by date and how strong it was. Higher up the chart is
            more severe.
          </CardDescription>
        </div>
      </CardHeader>

      {!hasData ? (
        <EmptyState
          icon={Stethoscope}
          title="No side effects logged"
          description="Log a side effect and it shows up here, so you can see how severity moves over time and which medication it lines up with."
          className="m-4"
        />
      ) : (
        <div className="px-4 py-4">
          <div className="tnum h-56 w-full" aria-label="Side-effect severity over time, scatter chart">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
                <CartesianGrid stroke={GRID} strokeDasharray="2 4" />
                <XAxis
                  type="number"
                  dataKey="t"
                  domain={domain}
                  scale="time"
                  tick={{ fill: AXIS, fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: GRID }}
                  tickFormatter={(v) => format(new Date(v), "MMM d")}
                  minTickGap={32}
                />
                <YAxis
                  type="number"
                  dataKey="severity"
                  domain={[0, 5]}
                  ticks={[1, 2, 3, 4, 5]}
                  tick={{ fill: AXIS, fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  allowDecimals={false}
                />
                <ZAxis range={[48, 48]} />
                <Tooltip content={<ScatterTooltip />} cursor={{ stroke: GRID }} />
                {series
                  .filter((s) => s.points.length > 0)
                  .map((s) => (
                    <Scatter
                      key={s.id}
                      name={s.label}
                      data={s.points.map((p) => ({ ...p, _med: s.label }))}
                      fill={s.color}
                      isAnimationActive={false}
                    />
                  ))}
                {unattributed.length > 0 ? (
                  <Scatter
                    name="Unattributed"
                    data={unattributed}
                    fill={UNATTRIBUTED_COLOR}
                    isAnimationActive={false}
                  />
                ) : null}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <MedLegend
              entries={legendEntries}
              extra={
                unattributed.length > 0
                  ? [{ label: "Not linked to a medication", color: UNATTRIBUTED_COLOR }]
                  : undefined
              }
            />
            <p className="label-mono text-[11px] text-faint" aria-hidden>
              severity <span className="tnum text-muted">1</span> mild ·{" "}
              <span className="tnum text-muted">5</span> severe
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
