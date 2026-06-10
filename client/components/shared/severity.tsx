import { Badge } from "@/components/ui/badge";

/** Interaction severity → consistent color across CascadeMap + MedCards (PRD §10.2/§17). */
export type Severity = "monitor" | "caution" | "contraindicated" | "minor" | "moderate" | "major";

const map: Record<Severity, { label: string; variant: "warning" | "danger" | "neutral" }> = {
  minor: { label: "Monitor", variant: "warning" },
  monitor: { label: "Monitor", variant: "warning" },
  moderate: { label: "Caution", variant: "warning" },
  caution: { label: "Caution", variant: "warning" },
  major: { label: "Contraindicated", variant: "danger" },
  contraindicated: { label: "Contraindicated", variant: "danger" },
};

export function SeverityBadge({ severity }: { severity: string }) {
  const key = severity.toLowerCase() as Severity;
  const cfg = map[key] ?? { label: severity, variant: "neutral" as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

/** Hex color for a severity, used by react-flow edge styling. */
export function severityColor(severity: string): string {
  const s = severity.toLowerCase();
  if (s.includes("contra") || s === "major") return "#ef4444";
  if (s.includes("caution") || s === "moderate") return "#f97316";
  return "#f59e0b";
}
