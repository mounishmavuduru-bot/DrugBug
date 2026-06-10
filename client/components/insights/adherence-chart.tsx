"use client";

import { useMemo } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { Activity } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/states";
import type { AdherencePoint } from "@/components/insights/insights-utils";
import { overallAdherence } from "@/components/insights/insights-utils";

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
    <div className="surface rounded-md border border-border px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-text">{p.label}</p>
      {p.rate === null ? (
        <p className="text-muted">Nothing scheduled</p>
      ) : (
        <p className="text-muted">
          <span className="mono text-text">{p.rate}%</span> on time ·{" "}
          <span className="mono text-text">
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
          <CardTitle>Adherence</CardTitle>
          <CardDescription>30-day on-time rate (taken or late vs. scheduled)</CardDescription>
        </div>
        {overall !== null ? (
          <Badge variant={overall >= 80 ? "success" : overall >= 50 ? "warning" : "danger"}>
            <span className="mono">{overall}%</span> overall
          </Badge>
        ) : null}
      </CardHeader>

      {!hasData ? (
        <EmptyState
          icon={Activity}
          title="No dose history yet"
          description="Once you log doses, your 30-day on-time rate appears here."
        />
      ) : (
        <div className="h-56 w-full" aria-label="30-day adherence line chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "#94a3b8", fontSize: 10 }}
                tickLine={false}
                axisLine={{ stroke: "#1e293b" }}
                minTickGap={24}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tick={{ fill: "#94a3b8", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}%`}
                width={44}
              />
              <Tooltip content={<AdherenceTooltip />} cursor={{ stroke: "#1e293b" }} />
              <Line
                type="monotone"
                dataKey="rate"
                stroke="#06b6d4"
                strokeWidth={2}
                dot={{ r: 2, fill: "#06b6d4" }}
                activeDot={{ r: 4 }}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
