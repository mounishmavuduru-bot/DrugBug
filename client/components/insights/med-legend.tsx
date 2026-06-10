"use client";

/** Shared categorical legend for per-med chart series (PRD §10.3). */
export function MedLegend({
  entries,
  extra,
}: {
  entries: { id: string; label: string; color: string }[];
  /** Optional trailing entries (e.g. "Unattributed"). */
  extra?: { label: string; color: string }[];
}) {
  if (entries.length === 0 && !extra?.length) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Medication legend">
      {entries.map((e) => (
        <li key={e.id} className="flex items-center gap-1.5 text-xs text-muted">
          <span
            className="inline-block size-2.5 shrink-0 rounded-sm"
            style={{ backgroundColor: e.color }}
            aria-hidden
          />
          <span className="mono text-text">{e.label}</span>
        </li>
      ))}
      {extra?.map((e) => (
        <li key={e.label} className="flex items-center gap-1.5 text-xs text-muted">
          <span
            className="inline-block size-2.5 shrink-0 rounded-sm"
            style={{ backgroundColor: e.color }}
            aria-hidden
          />
          <span>{e.label}</span>
        </li>
      ))}
    </ul>
  );
}
