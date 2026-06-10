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
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/states";
import { MedLegend } from "@/components/insights/med-legend";
import type { ScatterPoint } from "@/components/insights/insights-utils";

interface SeriesEntry {
  id: string;
  label: string;
  color: string;
  points: ScatterPoint[];
}

const UNATTRIBUTED_COLOR = "#64748b";

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
    <div className="surface rounded-md border border-border px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-text">{p.symptom}</p>
      <p className="text-muted">
        Severity <span className="mono text-text">{p.severity}/5</span>
      </p>
      <p className="text-muted">{p.when}</p>
      {p._med ? <p className="mono text-text">{p._med}</p> : null}
    </div>
  );
}

/**
 * Side-effect severity over time, one series per medication (PRD §10.3).
 * x = time, y = severity (1..5), color = med. Unattributed logs render gray.
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
          <CardTitle>Side effects over time</CardTitle>
          <CardDescription>Logged severity (1–5), color-coded by medication</CardDescription>
        </div>
      </CardHeader>

      {!hasData ? (
        <EmptyState
          icon={Stethoscope}
          title="No side effects logged"
          description="Log a side effect to see how severity tracks over time, by medication."
        />
      ) : (
        <>
          <div className="h-56 w-full" aria-label="Side-effect severity scatter chart">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="t"
                  domain={domain}
                  scale="time"
                  tick={{ fill: "#94a3b8", fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: "#1e293b" }}
                  tickFormatter={(v) => format(new Date(v), "MMM d")}
                  minTickGap={32}
                />
                <YAxis
                  type="number"
                  dataKey="severity"
                  domain={[0, 5]}
                  ticks={[1, 2, 3, 4, 5]}
                  tick={{ fill: "#94a3b8", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  allowDecimals={false}
                />
                <ZAxis range={[48, 48]} />
                <Tooltip content={<ScatterTooltip />} cursor={{ stroke: "#1e293b" }} />
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
          <MedLegend
            entries={legendEntries}
            extra={
              unattributed.length > 0
                ? [{ label: "Unattributed", color: UNATTRIBUTED_COLOR }]
                : undefined
            }
          />
        </>
      )}
    </Card>
  );
}
