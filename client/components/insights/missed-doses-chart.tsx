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
import { Card, CardHeader, CardEyebrow, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/states";
import { MedLegend } from "@/components/insights/med-legend";
import type { MissedDayRow } from "@/components/insights/insights-utils";

// Monograph chart palette.
const GRID = "#e0d7c4";
const AXIS = "#6a6052";
const CURSOR = "rgba(101,93,82,0.12)";

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
    <div className="rounded-[var(--radius-sm)] border border-rule-strong bg-card px-3 py-2 text-xs">
      <p className="mb-1 font-medium text-ink">{label}</p>
      {items.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-1.5 text-muted">
          <span
            className="inline-block size-2 rounded-[1px]"
            style={{ backgroundColor: p.color }}
            aria-hidden
          />
          <span className="label-mono text-ink">{p.name}</span>
          <span className="label-mono tnum text-ink">{p.value}</span> missed
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
          <CardEyebrow>Adherence · misses</CardEyebrow>
          <CardTitle className="mt-1">Missed doses</CardTitle>
          <CardDescription>
            Doses you marked missed each day, stacked by medication so you can see which one slips.
          </CardDescription>
        </div>
      </CardHeader>

      {!hasData ? (
        <EmptyState
          icon={CalendarX}
          title="No missed doses"
          description="You haven't marked any dose missed in the last 30 days."
          className="m-4"
        />
      ) : (
        <div className="px-4 py-4">
          <div className="tnum h-48 w-full" aria-label="Missed doses per day, stacked bar chart by medication">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -24 }}>
                <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: AXIS, fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: GRID }}
                  minTickGap={16}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: AXIS, fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                />
                <Tooltip content={<MissedTooltip />} cursor={{ fill: CURSOR }} />
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
        </div>
      )}
    </Card>
  );
}
