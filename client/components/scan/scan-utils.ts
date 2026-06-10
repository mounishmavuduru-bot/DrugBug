// Pure helpers for DrugScan (PRD §10.1). No React here. Row field names are
// camelCase; `scanId` is a bigint. The Inference Service writes `auth_layers`
// and `raw_analysis` back as JSON strings, which we parse defensively below —
// the service owns the verdict; the client only *renders* what it receives.

import type { Infer } from "spacetimedb";
import ScansRow from "@/lib/spacetime/scans_table";

export type Scan = Infer<typeof ScansRow>;

export type ScanType = "bottle" | "pill" | "barcode";

export const SCAN_TYPES: { value: ScanType; label: string; hint: string }[] = [
  { value: "bottle", label: "Bottle", hint: "Prescription label or packaging" },
  { value: "pill", label: "Pill", hint: "A single loose tablet or capsule" },
  { value: "barcode", label: "Barcode", hint: "GS1 2D DataMatrix on the package" },
];

/**
 * Confidence threshold below which we never assert a single identity (PRD §10.1
 * safety gating). At or above → auto-identify; below → require user confirmation
 * against a top-3 candidate list.
 */
export const ID_CONFIDENCE_THRESHOLD = 0.8;

// ---- Aggregate authenticity verdict ----------------------------------------

export type Verdict = "verified" | "inconclusive" | "suspect";

export function verdictVariant(v: string): "success" | "warning" | "danger" | "neutral" {
  switch (v.toLowerCase()) {
    case "verified":
      return "success";
    case "suspect":
      return "danger";
    case "inconclusive":
      return "warning";
    default:
      return "neutral";
  }
}

export function verdictLabel(v: string): string {
  switch (v.toLowerCase()) {
    case "verified":
      return "Verified";
    case "suspect":
      return "Suspect";
    case "inconclusive":
      return "Inconclusive";
    default:
      return v || "Unknown";
  }
}

// ---- Per-layer authenticity breakdown --------------------------------------

export type LayerState = "pass" | "fail" | "inconclusive" | "unavailable";

export interface AuthLayer {
  /** stable key: barcode | ndc | recall | physical | serialized (or unknown) */
  key: string;
  label: string;
  state: LayerState;
  reasons: string[];
  credentialGated?: boolean;
}

const LAYER_LABELS: Record<string, string> = {
  barcode: "Barcode decode (GS1)",
  ndc: "NDC validity (openFDA)",
  recall: "Recall / enforcement",
  physical: "Physical anomaly (vision)",
  serialized: "Serialized verification (DSCSA VRS)",
};

function coerceLayerState(raw: unknown): LayerState {
  if (typeof raw === "boolean") return raw ? "pass" : "fail";
  const s = String(raw ?? "").toLowerCase();
  if (["pass", "passed", "ok", "valid", "verified", "true"].includes(s)) return "pass";
  if (["fail", "failed", "invalid", "suspect", "false"].includes(s)) return "fail";
  if (["unavailable", "not_configured", "no_credentials", "skipped", "n/a", "na"].includes(s))
    return "unavailable";
  return "inconclusive";
}

function coerceReasons(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((r) => String(r)).filter(Boolean);
  if (typeof raw === "string" && raw.trim()) return [raw.trim()];
  return [];
}

/**
 * Parse the `auth_layers` JSON. The service emits one entry per verification
 * layer; we normalize a few shapes:
 *   { barcode: { state, reasons }, ndc: {...}, ... }
 *   { barcode: "pass", ... }
 *   [ { key, state, reasons }, ... ]
 * Returns [] when there is nothing parseable so the UI degrades gracefully.
 */
export function parseAuthLayers(json: string | undefined | null): AuthLayer[] {
  if (!json) return [];
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return [];
  }

  const fromEntry = (key: string, value: unknown): AuthLayer => {
    const label = LAYER_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      const state = coerceLayerState(obj.state ?? obj.status ?? obj.result ?? obj.pass);
      return {
        key,
        label,
        state,
        reasons: coerceReasons(obj.reasons ?? obj.reason ?? obj.detail ?? obj.message),
        credentialGated:
          Boolean(obj.credentialGated ?? obj.credential_gated) || key === "serialized",
      };
    }
    return {
      key,
      label,
      state: coerceLayerState(value),
      reasons: [],
      credentialGated: key === "serialized",
    };
  };

  if (Array.isArray(data)) {
    return data
      .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
      .map((e) => {
        const key = String(e.key ?? e.layer ?? e.name ?? "unknown");
        return fromEntry(key, e);
      });
  }

  if (data && typeof data === "object") {
    return Object.entries(data as Record<string, unknown>).map(([k, v]) => fromEntry(k, v));
  }

  return [];
}

// ---- Low-confidence candidate list -----------------------------------------

export interface Candidate {
  name: string;
  ndc?: string;
  imprint?: string;
  shape?: string;
  color?: string;
  confidence?: number;
}

/**
 * Pull a top-N candidate list out of `raw_analysis` JSON for the low-confidence
 * confirmation UI (PRD §10.1 — never assert a single identity at low confidence).
 * Accepts `{ candidates: [...] }` or a bare array; tolerates snake/camel fields.
 */
export function parseCandidates(json: string | undefined | null, limit = 3): Candidate[] {
  if (!json) return [];
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return [];
  }
  const arr = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as Record<string, unknown>).candidates)
      ? ((data as Record<string, unknown>).candidates as unknown[])
      : [];
  return arr
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map((c) => {
      const conf = c.confidence ?? c.score ?? c.idConfidence ?? c.id_confidence;
      return {
        name: String(c.name ?? c.drug ?? c.identifiedDrug ?? c.identified_drug ?? "Unknown"),
        ndc: c.ndc ? String(c.ndc) : undefined,
        imprint: c.imprint ? String(c.imprint) : undefined,
        shape: c.shape ? String(c.shape) : undefined,
        color: c.color ? String(c.color) : undefined,
        confidence: typeof conf === "number" ? conf : undefined,
      };
    })
    .slice(0, limit);
}

// ---- GS1 DataMatrix parsing (on-device, PRD §10.1 layer 1) ------------------

export interface Gs1Fields {
  gtin?: string;
  ndc?: string; // derived from GTIN (NDC is embedded in the GTIN-14)
  serial?: string;
  lot?: string;
  expiry?: string; // YYYY-MM-DD
}

/** GS1 Application Identifier → field length (variable-length AIs end at FNC1). */
const FIXED_LEN_AI: Record<string, number> = {
  "01": 14, // GTIN
  "11": 6, // production date
  "15": 6, // best-before
  "17": 6, // expiry (YYMMDD)
};
// AIs whose data runs until the FNC1 group separator (or end of string).
const VARIABLE_AI = new Set(["10", "21"]); // 10 = lot/batch, 21 = serial

const FNC1 = String.fromCharCode(29); // GS / ASCII 29, the GS1 separator

/**
 * Parse a decoded GS1 DataMatrix payload into GTIN / serial / lot / expiry.
 * Tolerant: strips a leading FNC1, walks AIs, derives NDC from the GTIN.
 * This is a *display aid only* — the server re-validates AI structure (PRD §10.1).
 */
export function parseGs1(payload: string): Gs1Fields {
  if (!payload) return {};
  let s = payload;
  // Some scanners surface the leading FNC1 as the literal "]d2" symbology id.
  if (s.startsWith("]d2") || s.startsWith("]C1")) s = s.slice(3);
  if (s.charCodeAt(0) === 29) s = s.slice(1);

  const out: Gs1Fields = {};
  let i = 0;
  // AIs are 2–4 digits; the medical set we care about is all 2-digit.
  while (i < s.length) {
    const ai = s.slice(i, i + 2);
    if (!/^\d{2}$/.test(ai)) break;
    i += 2;
    if (ai in FIXED_LEN_AI) {
      const len = FIXED_LEN_AI[ai];
      const val = s.slice(i, i + len);
      i += len;
      applyAi(out, ai, val);
    } else if (VARIABLE_AI.has(ai)) {
      const sep = s.indexOf(FNC1, i);
      const end = sep === -1 ? s.length : sep;
      const val = s.slice(i, end);
      i = sep === -1 ? s.length : sep + 1;
      applyAi(out, ai, val);
    } else {
      // Unknown AI — stop rather than misparse downstream fields.
      break;
    }
    if (s.charCodeAt(i) === 29) i += 1; // consume a trailing separator
  }
  return out;
}

function applyAi(out: Gs1Fields, ai: string, val: string) {
  switch (ai) {
    case "01":
      out.gtin = val;
      out.ndc = gtinToNdc(val);
      break;
    case "17":
      out.expiry = yymmdd(val);
      break;
    case "10":
      out.lot = val;
      break;
    case "21":
      out.serial = val;
      break;
  }
}

/** GTIN-14 → 10-digit NDC (drop indicator + leading "3" country code, strip check digit). */
function gtinToNdc(gtin: string): string | undefined {
  if (!/^\d{14}$/.test(gtin)) return undefined;
  // US drug GTINs are "0 03 <10-digit NDC> <check>": positions 3..12 are the NDC.
  const ndc = gtin.slice(3, 13);
  return /^\d{10}$/.test(ndc) ? ndc : undefined;
}

/** GS1 YYMMDD → YYYY-MM-DD ("00" day = last day of month per GS1 spec → keep as 01). */
function yymmdd(v: string): string | undefined {
  if (!/^\d{6}$/.test(v)) return undefined;
  const yy = Number(v.slice(0, 2));
  const mm = v.slice(2, 4);
  const ddRaw = v.slice(4, 6);
  const dd = ddRaw === "00" ? "01" : ddRaw;
  const year = 2000 + yy; // GS1 dates are 2000+
  return `${year}-${mm}-${dd}`;
}

// ---- Prefill handoff to /meds/add (PRD §9.4 path 1) -------------------------

export interface ScanPrefill {
  name: string;
  genericName: string;
  rxnormCode: string;
  ndc: string;
}

export const PREFILL_STORAGE_KEY = "drugbug:scan-prefill";

/** Stash an identified med for the add form (sessionStorage survives the route push). */
export function stashPrefill(p: ScanPrefill): void {
  try {
    sessionStorage.setItem(PREFILL_STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* storage disabled — query-param fallback still carries the name */
  }
}

/** Read + clear a stashed prefill (idempotent). */
export function readPrefill(): ScanPrefill | null {
  try {
    const raw = sessionStorage.getItem(PREFILL_STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PREFILL_STORAGE_KEY);
    return JSON.parse(raw) as ScanPrefill;
  } catch {
    return null;
  }
}
