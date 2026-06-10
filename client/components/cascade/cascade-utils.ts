// Shared types + helpers for CascadeMap (PRD §10.2).
//
// The InteractionsCache row stores `pairs` and `cascades` as JSON strings written
// by the Inference Service. We parse them here and normalize into stable shapes
// the graph + panels consume. Field names mirror the inference-client report
// (PairFinding / CascadeFinding) so the synchronous pre-commit check and the
// persisted cache speak the same vocabulary.

import type { Medication } from "@/components/med/med-utils";

/** A pairwise interaction finding (KB-sourced fact or model prediction). */
export interface CascadePair {
  drugA: string;
  drugB: string;
  severity: string; // monitor | caution | contraindicated (or minor/moderate/major)
  mechanism: string;
  effect?: string;
  management: string;
  source: "kb" | "model";
  confidence?: number; // 0..1, present for model-predicted findings
}

/** A 3+ drug cascade finding (model-predicted or mechanistic overlay). */
export interface CascadeChain {
  drugs: string[];
  risk: number; // 0..1 aggregate cascade risk
  dominantMechanism: string;
  explanation: string;
  source: "model" | "mechanistic" | "kb";
  confidence?: number;
}

/** Parse a JSON-string field from the cache row, tolerating null/empty/garbage. */
function parseJson<T>(raw: string | undefined | null): T[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

export function parsePairs(raw: string | undefined | null): CascadePair[] {
  return parseJson<CascadePair>(raw).filter(
    (p) => p && typeof p.drugA === "string" && typeof p.drugB === "string"
  );
}

export function parseCascades(raw: string | undefined | null): CascadeChain[] {
  return parseJson<CascadeChain>(raw).filter(
    (c) => c && Array.isArray(c.drugs) && c.drugs.length >= 3
  );
}

/**
 * Match a finding's drug label to one of the user's active meds. Findings come
 * back keyed by generic/brand name or rxcui; we compare case-insensitively
 * against name + genericName + rxnormCode so edges land on the right nodes.
 */
export function medKeyFor(label: string, meds: Medication[]): string | undefined {
  const l = label.trim().toLowerCase();
  if (!l) return undefined;
  const hit = meds.find(
    (m) =>
      m.name.toLowerCase() === l ||
      m.genericName.toLowerCase() === l ||
      m.rxnormCode === label.trim()
  );
  if (hit) return hit.medId.toString();
  // Fallback: substring match against either name (handles "Lipitor 10 mg" vs "Lipitor").
  const loose = meds.find(
    (m) =>
      m.name.toLowerCase().includes(l) ||
      l.includes(m.name.toLowerCase()) ||
      m.genericName.toLowerCase().includes(l) ||
      l.includes(m.genericName.toLowerCase())
  );
  return loose?.medId.toString();
}

/** A node position on a circle, so the graph reads cleanly without a physics sim. */
export interface CirclePoint {
  x: number;
  y: number;
}

/**
 * Lay nodes out on a circle. Deterministic (no layout flicker on re-render) and
 * cheap — pairwise + set scoring over ~10 drugs is the expected scale (PRD §10.2).
 */
export function circularLayout(count: number, radius = 220): CirclePoint[] {
  if (count <= 0) return [];
  if (count === 1) return [{ x: 0, y: 0 }];
  const pts: CirclePoint[] = [];
  // Start at the top (-90°) and go clockwise.
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
    pts.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  }
  return pts;
}

/** Severity rank for sorting / picking the "worst" edge color on a node. */
export function severityRank(severity: string): number {
  const s = severity.toLowerCase();
  if (s.includes("contra") || s === "major") return 3;
  if (s.includes("caution") || s === "moderate") return 2;
  return 1; // monitor / minor
}

/** Build a stable edge id for a pair, order-independent. */
export function pairEdgeId(aId: string, bId: string): string {
  return [aId, bId].sort().join("→");
}
