import { cn } from "@/lib/utils";

/**
 * Calibrated confidence (anti-vibe completeness + PRD §18). The number is always
 * visible so uncertainty is never hidden. Rendered as a thin ruled meter, not a
 * glowing bar. Color is earthy and meaningful, never decorative neon.
 */
export function ConfidenceBar({
  value,
  label = "Confidence",
  className,
}: {
  value: number; // 0..1
  label?: string;
  className?: string;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const tone =
    value >= 0.8 ? "bg-positive" : value >= 0.5 ? "bg-monitor" : "bg-danger";
  return (
    <div className={cn("w-full", className)}>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="label-mono tnum text-ink">{pct}%</span>
      </div>
      <div
        className="h-1 w-full overflow-hidden rounded-[var(--radius-pill)] bg-rule"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className={cn("h-full", tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Distinguishes model-predicted findings from reference-sourced facts (PRD §10.2). */
export function SourceTag({ source }: { source: "kb" | "model" | "mechanistic" }) {
  const map = {
    kb: { label: "Reference", cls: "text-faint" },
    model: { label: "Model-predicted", cls: "text-caution" },
    mechanistic: { label: "Mechanism-flagged", cls: "text-monitor" },
  } as const;
  const c = map[source];
  return (
    <span className={cn("label-mono text-[10px] uppercase tracking-[0.12em]", c.cls)}>
      {c.label}
    </span>
  );
}
