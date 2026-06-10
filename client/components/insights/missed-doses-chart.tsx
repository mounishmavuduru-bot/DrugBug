"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarX } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/states";
import { MedLegend } from "@/components/insights/med-legend";
import type { MissedDayRow } from "@/components/insights/insights-utils";

interface MedEntry {
  id: string;
  label: string;
  color: string;
}

interface MissedTooltipItem {
  name?: string;
  value?: number;
  color?: string;
  dataKey?: string;
}

function MissedTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: MissedTooltipItem[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const items = payload.filter((p) => (p.value ?? 0) > 0);
  if (items.length === 0) return null;
  return (
    <div className="surface rounded-md border border-border px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-text">{label}</p>
      {items.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-1.5 text-muted">
          <span
            className="inline-block size-2 rounded-sm"
            style={{ backgroundColor: p.color }}
            aria-hidden
          />
          <span className="mono text-text">{p.name}</span>
          <span className="mono text-text">{p.value}</span> missed
        </p>
      ))}
    </div>
  );
}

/** Missed doses per day, stacked + color-coded by medication (PRD §10.3). */
export function MissedDosesChart({
  data,
  meds,
}: {
  data: MissedDayRow[];
  meds: MedEntry[];
}) {
  const hasData = useMemo(() => data.length > 0, [data]);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Missed doses</CardTitle>
          <CardDescription>By day over the last 30 days, color-coded by medication</CardDescription>
        </div>
      </CardHeader>

      {!hasData ? (
        <EmptyState
          icon={CalendarX}
          title="No missed doses"
          description="No doses were marked missed in the last 30 days."
        />
      ) : (
        <>
          <div className="h-48 w-full" aria-label="Missed doses bar chart by medication">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -24 }}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#94a3b8", fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: "#1e293b" }}
                  minTickGap={16}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: "#94a3b8", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                />
                <Tooltip content={<MissedTooltip />} cursor={{ fill: "#1e293b55" }} />
                {meds.map((m) => (
                  <Bar
                    key={m.id}
                    dataKey={m.id}
                    name={m.label}
                    stackId="missed"
                    fill={m.color}
                    isAnimationActive={false}
                    radius={[2, 2, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <MedLegend entries={meds} />
        </>
      )}
    </Card>
  );
}
