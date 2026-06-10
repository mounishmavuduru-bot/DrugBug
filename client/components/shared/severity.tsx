import { Badge } from "@/components/ui/badge";

/** Interaction severity → consistent, meaningful color across the app (PRD §10.2). */
export type Severity =
  | "monitor" | "caution" | "contraindicated"
  | "minor" | "moderate" | "major";

const map: Record<Severity, { label: string; variant: "monitor" | "caution" | "danger" }> = {
  minor: { label: "Monitor", variant: "monitor" },
  monitor: { label: "Monitor", variant: "monitor" },
  moderate: { label: "Caution", variant: "caution" },
  caution: { label: "Caution", variant: "caution" },
  major: { label: "Contraindicated", variant: "danger" },
  contraindicated: { label: "Contraindicated", variant: "danger" },
};

export function SeverityBadge({ severity }: { severity: string }) {
  const key = severity.toLowerCase() as Severity;
  const cfg = map[key] ?? { label: severity, variant: "monitor" as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

/** Hex for react-flow edge styling — earthy clinical signals (matches the palette). */
export function severityColor(severity: string): string {
  const s = severity.toLowerCase();
  if (s.includes("contra") || s === "major") return "#c01526";
  if (s.includes("caution") || s === "moderate") return "#b8541b";
  return "#98690f";
}
