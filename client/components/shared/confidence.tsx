import { cn } from "@/lib/utils";

/**
 * Calibrated confidence display (PRD §18: all clinical-adjacent ML outputs show
 * calibrated confidence). Color tracks certainty; the numeric value is always
 * visible so uncertainty is never hidden.
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
    value >= 0.8 ? "bg-success" : value >= 0.5 ? "bg-warning" : "bg-danger";
  return (
    <div className={cn("w-full", className)}>
      <div className="mb-1 flex items-center justify-between text-xs text-muted">
        <span>{label}</span>
        <span className="mono text-text">{pct}%</span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-elevated"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className={cn("h-full rounded-full transition-fast", tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Tag distinguishing model-predicted findings from KB-sourced facts (PRD §10.2). */
export function SourceTag({ source }: { source: "kb" | "model" }) {
  return source === "model" ? (
    <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
      Model-predicted
    </span>
  ) : (
    <span className="rounded bg-elevated px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
      Reference
    </span>
  );
}
