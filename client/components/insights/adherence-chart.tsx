"use client";

import { useMemo } from "react";
import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { Activity } from "lucide-react";
import { Card, CardHeader, CardEyebrow, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/states";
import type { AdherencePoint } from "@/components/insights/insights-utils";
import { overallAdherence } from "@/components/insights/insights-utils";

// Monograph chart palette — ink/green on a warm paper card, hairline grid.
const GRID = "#e0d7c4";
const AXIS = "#6a6052";
const LINE = "#15402e"; // brand — deep pharmacy green
const TARGET = "#cabfa6"; // rule-strong — the 80% on-time reference line
const ADHERENCE_TARGET = 80; // the on-time line clinicians tend to watch

interface TooltipPayloadItem {
  payload?: AdherencePoint;
}

function AdherenceTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="rounded-[var(--radius-sm)] border border-rule-strong bg-card px-3 py-2 text-xs">
      <p className="font-medium text-ink">{p.label}</p>
      {p.rate === null ? (
        <p className="text-muted">Nothing scheduled</p>
      ) : (
        <p className="text-muted">
          <span className="label-mono tnum text-ink">{p.rate}%</span> on time ·{" "}
          <span className="label-mono tnum text-ink">
            {p.onTime}/{p.scheduled}
          </span>{" "}
          doses
        </p>
      )}
    </div>
  );
}

/**
 * 30-day on-time adherence line (PRD §10.3). On-time = taken or late, over all
 * doses scheduled that day. Days with no scheduled doses leave a gap.
 */
export function AdherenceChart({ series }: { series: AdherencePoint[] }) {
  const overall = useMemo(() => overallAdherence(series), [series]);
  const hasData = useMemo(() => series.some((p) => p.rate !== null), [series]);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardEyebrow>Adherence · daily</CardEyebrow>
          <CardTitle className="mt-1">On-time doses</CardTitle>
          <CardDescription>
            Share of each day&apos;s scheduled doses you took on time or late.
          </CardDescription>
        </div>
        {overall !== null ? (
          <Badge variant={overall >= ADHERENCE_TARGET ? "positive" : overall >= 50 ? "caution" : "danger"}>
            <span className="label-mono tnum">{overall}%</span> overall
          </Badge>
        ) : null}
      </CardHeader>

      {!hasData ? (
        <EmptyState
          icon={Activity}
          title="No dose history yet"
          description="Once you start logging doses, your 30-day on-time rate is plotted here."
          className="m-4"
        />
      ) : (
        <div className="px-4 py-4">
          <div className="tnum h-56 w-full" aria-label="30-day on-time dose rate, line chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
                <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: AXIS, fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: GRID }}
                  minTickGap={24}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  tick={{ fill: AXIS, fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}%`}
                  width={44}
                />
                <ReferenceLine
                  y={ADHERENCE_TARGET}
                  stroke={TARGET}
                  strokeDasharray="4 4"
                  strokeWidth={1}
                  label={{
                    value: `${ADHERENCE_TARGET}% target`,
                    position: "insideTopRight",
                    fill: AXIS,
                    fontSize: 10,
                    dy: -3,
                  }}
                />
                <Tooltip content={<AdherenceTooltip />} cursor={{ stroke: GRID }} />
                <Line
                  type="monotone"
                  dataKey="rate"
                  stroke={LINE}
                  strokeWidth={2}
                  dot={{ r: 2, fill: LINE }}
                  activeDot={{ r: 4 }}
                  connectNulls
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </Card>
  );
}
