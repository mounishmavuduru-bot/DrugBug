// Pure helpers for the Insights screen (PRD §10.3 PatternFinder + AdherenceForecaster).
// Kept React-free so the chart aggregations can be reasoned about independently.

import { format } from "date-fns";
import type { Dose, SideEffect, Medication } from "@/lib/spacetime/types";
import { tsToDate } from "@/lib/format";

/** Number of trailing days the Insights charts cover (PRD §10.3 "30-day"). */
export const WINDOW_DAYS = 30;

/**
 * Deterministic categorical palette for per-med series, drawn from the Monograph
 * palette only — ink, pharmacy green, and the earthy clinical signal hues plus a
 * few muted neutrals. No rainbow, no neon, no violet/cyan. Index by a med's stable
 * position in the active list so colors don't reshuffle between renders.
 */
export const MED_PALETTE = [
  "#15402e", // brand — deep pharmacy green
  "#936410", // monitor — ochre
  "#b5521e", // caution — burnt orange
  "#2f6d4f", // positive — moss green
  "#a32a1a", // danger — brick
  "#6a6052", // muted — warm grey
  "#7a5a2c", // brown
  "#4a5d3a", // olive
  "#8a4a3a", // clay
  "#3a4d52", // slate
] as const;

export function colorForIndex(i: number): string {
  return MED_PALETTE[i % MED_PALETTE.length];
}

/** A med's display name for charts/legends (brand name; falls back to generic). */
export function medLabel(med: Medication | undefined): string {
  if (!med) return "Unknown";
  return med.name || med.genericName || `Med ${med.medId}`;
}

/** Build a medId(string) → { label, color } map keyed by active-list order. */
export function buildMedColorMap(
  meds: readonly Medication[]
): Map<string, { label: string; color: string }> {
  const map = new Map<string, { label: string; color: string }>();
  meds.forEach((m, i) => {
    map.set(m.medId.toString(), { label: medLabel(m), color: colorForIndex(i) });
  });
  return map;
}

/** Local YYYY-MM-DD key (NOT UTC) so day-bucketing matches the user's clock. */
function dayKey(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/** Start-of-day for the day that is `daysAgo` before `ref` (local time). */
function startOfDayDaysAgo(ref: Date, daysAgo: number): Date {
  const d = new Date(ref);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d;
}

export interface AdherencePoint {
  /** Local day key (yyyy-MM-dd). */
  key: string;
  /** Short axis label, e.g. "Jun 3". */
  label: string;
  /** Scheduled (non-PRN) doses that day. */
  scheduled: number;
  /** Doses taken on time or late that day. */
  onTime: number;
  /** On-time rate 0..100, or null when nothing was scheduled (gap in line). */
  rate: number | null;
}

/**
 * 30-day on-time adherence series, grouped by local day.
 * On-time = status `taken` OR `late` (the dose was eventually taken); the
 * denominator is every dose scheduled that day regardless of outcome.
 */
export function adherenceSeries(
  doses: readonly Dose[],
  windowDays: number = WINDOW_DAYS,
  ref: Date = new Date()
): AdherencePoint[] {
  const buckets = new Map<string, { scheduled: number; onTime: number }>();
  const start = startOfDayDaysAgo(ref, windowDays - 1).getTime();

  for (const dose of doses) {
    const at = tsToDate(dose.scheduledAt);
    if (!at) continue;
    if (at.getTime() < start) continue;
    if (at.getTime() > ref.getTime()) continue; // ignore future scheduled doses
    const k = dayKey(at);
    const b = buckets.get(k) ?? { scheduled: 0, onTime: 0 };
    b.scheduled += 1;
    if (dose.status === "taken" || dose.status === "late") b.onTime += 1;
    buckets.set(k, b);
  }

  const out: AdherencePoint[] = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    const day = startOfDayDaysAgo(ref, i);
    const k = dayKey(day);
    const b = buckets.get(k);
    out.push({
      key: k,
      label: format(day, "MMM d"),
      scheduled: b?.scheduled ?? 0,
      onTime: b?.onTime ?? 0,
      rate: b && b.scheduled > 0 ? Math.round((b.onTime / b.scheduled) * 100) : null,
    });
  }
  return out;
}

/** Overall on-time rate across the window (0..100), or null if nothing scheduled. */
export function overallAdherence(series: AdherencePoint[]): number | null {
  let scheduled = 0;
  let onTime = 0;
  for (const p of series) {
    scheduled += p.scheduled;
    onTime += p.onTime;
  }
  return scheduled > 0 ? Math.round((onTime / scheduled) * 100) : null;
}

export interface MissedDayRow {
  key: string;
  label: string;
  /** Missed count per medId (string). Recharts stacks one Bar per med. */
  [medId: string]: number | string;
}

/**
 * Missed doses per day, broken out per medication so they can be color-coded
 * (one stacked bar segment per med). Only days with ≥1 miss are returned.
 */
export function missedByMedSeries(
  doses: readonly Dose[],
  medIds: readonly string[],
  windowDays: number = WINDOW_DAYS,
  ref: Date = new Date()
): MissedDayRow[] {
  const start = startOfDayDaysAgo(ref, windowDays - 1).getTime();
  const byDay = new Map<string, MissedDayRow>();

  for (const dose of doses) {
    if (dose.status !== "missed") continue;
    const at = tsToDate(dose.scheduledAt);
    if (!at) continue;
    if (at.getTime() < start || at.getTime() > ref.getTime()) continue;
    const k = dayKey(at);
    let row = byDay.get(k);
    if (!row) {
      row = { key: k, label: format(at, "MMM d") };
      for (const id of medIds) row[id] = 0;
      byDay.set(k, row);
    }
    const id = dose.medId.toString();
    row[id] = ((row[id] as number) ?? 0) + 1;
  }

  return [...byDay.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

export interface ScatterPoint {
  /** Epoch ms of the log (x axis). */
  t: number;
  /** Severity 1..5 (y axis). */
  severity: number;
  symptom: string;
  /** Short date label for the tooltip. */
  when: string;
}

/** Group side-effect logs into per-med scatter series within the window. */
export function sideEffectScatter(
  sideEffects: readonly SideEffect[],
  windowDays: number = WINDOW_DAYS,
  ref: Date = new Date()
): { unattributed: ScatterPoint[]; byMed: Map<string, ScatterPoint[]> } {
  const start = startOfDayDaysAgo(ref, windowDays - 1).getTime();
  const byMed = new Map<string, ScatterPoint[]>();
  const unattributed: ScatterPoint[] = [];

  for (const se of sideEffects) {
    const at = tsToDate(se.loggedAt);
    if (!at) continue;
    if (at.getTime() < start || at.getTime() > ref.getTime()) continue;
    const point: ScatterPoint = {
      t: at.getTime(),
      severity: Math.max(1, Math.min(5, Number(se.severity))),
      symptom: se.symptom,
      when: format(at, "MMM d, h:mm a"),
    };
    if (se.medId === undefined || se.medId === null) {
      unattributed.push(point);
    } else {
      const id = se.medId.toString();
      const arr = byMed.get(id) ?? [];
      arr.push(point);
      byMed.set(id, arr);
    }
  }
  return { unattributed, byMed };
}

/** X-axis domain (epoch ms) for the scatter window. */
export function scatterDomain(
  windowDays: number = WINDOW_DAYS,
  ref: Date = new Date()
): [number, number] {
  return [startOfDayDaysAgo(ref, windowDays - 1).getTime(), ref.getTime()];
}

// ---- Brief reference state (PRD §10.5) ----

export type BriefState =
  | { kind: "none" }
  | { kind: "generating" }
  | { kind: "ready"; url?: string; ref: string };

/**
 * Interpret an appointment's `briefRef`. The Inference Service stores the brief
 * in object storage and writes back the ref via `attach_brief`. A ref that looks
 * like a URL is fetchable; a bare object-storage key renders as "ready" without
 * an inline preview (the signed URL is resolved server-side).
 */
export function briefStateFromRef(ref: string | undefined | null): BriefState {
  if (!ref) return { kind: "none" };
  const trimmed = ref.trim();
  if (!trimmed) return { kind: "none" };
  if (trimmed === "generating" || trimmed === "pending") return { kind: "generating" };
  const url = /^https?:\/\//i.test(trimmed) ? trimmed : undefined;
  return { kind: "ready", url, ref: trimmed };
}
