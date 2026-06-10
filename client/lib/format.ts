// Formatting helpers shared across screens. SpacetimeDB `Timestamp` values
// arrive as objects with `toDate()`; `u64` ids arrive as `bigint`.

import { format, formatDistanceToNowStrict, isToday, isTomorrow } from "date-fns";
import { Timestamp } from "spacetimedb";

/** SpacetimeDB Timestamp → JS Date. */
export function tsToDate(ts: Timestamp | undefined | null): Date | null {
  return ts ? ts.toDate() : null;
}

/** JS Date → SpacetimeDB Timestamp, for reducer arguments of type Timestamp. */
export function toTs(d: Date): Timestamp {
  return Timestamp.fromDate(d);
}

export function clockTime(d: Date | null): string {
  return d ? format(d, "h:mm a") : "—";
}

export function dayLabel(d: Date | null): string {
  if (!d) return "—";
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  return format(d, "EEE, MMM d");
}

export function relativeTo(d: Date | null): string {
  return d ? formatDistanceToNowStrict(d, { addSuffix: true }) : "—";
}

/** Countdown like "in 2h 14m"; negative → "overdue". */
export function countdown(target: Date | null): string {
  if (!target) return "—";
  const ms = target.getTime() - Date.now();
  if (ms <= 0) return "overdue";
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
}

export type DoseStatus = "pending" | "taken" | "missed" | "skipped" | "late";

export const doseStatusStyle: Record<
  DoseStatus,
  { label: string; variant: "neutral" | "brand" | "positive" | "monitor" | "caution" | "danger" | "outline" }
> = {
  pending: { label: "Due", variant: "outline" },
  taken: { label: "Taken", variant: "positive" },
  late: { label: "Late", variant: "caution" },
  missed: { label: "Missed", variant: "danger" },
  skipped: { label: "Skipped", variant: "neutral" },
};
