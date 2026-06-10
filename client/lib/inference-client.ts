// Typed client for the Python Inference Service (PRD §6/§7). All ML, vision, and
// external-API work lives there; results are written back to SpacetimeDB by the
// service's allowlisted identity, so most calls here are fire-and-forget triggers
// whose *results* arrive via realtime subscriptions. Synchronous helpers
// (RxNorm autocomplete, pre-commit interaction check) return JSON directly.

const BASE = process.env.NEXT_PUBLIC_INFERENCE_URL || "http://localhost:8000";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`inference ${path} failed: ${res.status} ${body}`);
  }
  return res.json() as Promise<T>;
}

// ---- RxNorm drug autocomplete (PRD §9.4 manual add) ----
export interface DrugSuggestion {
  rxcui: string;
  name: string;
  genericName: string;
  synonym?: string;
  tty?: string;
}
export function searchDrugs(query: string): Promise<{ results: DrugSuggestion[] }> {
  return req(`/search/drugs?q=${encodeURIComponent(query)}`);
}

// ---- Pre-commit interaction check (PRD §9.4 blocking modal on major finding) ----
export interface PairFinding {
  drugA: string;
  drugB: string;
  severity: string;
  mechanism: string;
  management: string;
  source: "kb" | "model";
  confidence?: number;
}
export interface CascadeFinding {
  drugs: string[];
  risk: number;
  dominantMechanism: string;
  explanation: string;
  source: "model" | "mechanistic";
}
export interface InteractionReport {
  pairs: PairFinding[];
  cascades: CascadeFinding[];
  hasMajor: boolean;
  modelVersion: string;
  kbVersion: string;
}
/** Synchronous check used before committing a new med (does not write back). */
export function checkInteractions(rxcuis: string[], identityHex: string): Promise<InteractionReport> {
  return req(`/interactions/check`, {
    method: "POST",
    body: JSON.stringify({ rxcuis, identity: identityHex }),
  });
}

/** Recompute + persist the full interaction/cascade set for a user (writes back). */
export function recomputeInteractions(identityHex: string): Promise<{ status: string }> {
  return req(`/interactions/recompute`, {
    method: "POST",
    body: JSON.stringify({ identity: identityHex }),
  });
}

// ---- DrugScan: upload image, service runs the pipeline + writes back (PRD §10.1) ----
export interface ScanResponse {
  scanId: string;
  status: string;
}
export async function submitScan(params: {
  scanId: bigint;
  identityHex: string;
  scanType: "bottle" | "pill" | "barcode";
  image: Blob;
}): Promise<ScanResponse> {
  const form = new FormData();
  form.append("scan_id", params.scanId.toString());
  form.append("identity", params.identityHex);
  form.append("scan_type", params.scanType);
  form.append("image", params.image, "scan.jpg");
  const res = await fetch(`${BASE}/scan`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`scan failed: ${res.status}`);
  return res.json();
}

// ---- AppointmentPrep brief (PRD §10.5) ----
export function generateBrief(params: {
  identityHex: string;
  apptId?: bigint;
  providerType?: string;
}): Promise<{ briefRef: string; status: string }> {
  return req(`/brief/generate`, {
    method: "POST",
    body: JSON.stringify({
      identity: params.identityHex,
      appt_id: params.apptId?.toString(),
      provider_type: params.providerType,
    }),
  });
}

// ---- PharmacoFit: upload genotype file, run PharmCAT, write phenotypes back (PRD §10.4) ----
export async function uploadGenotype(params: {
  identityHex: string;
  file: File;
}): Promise<{ status: string }> {
  const form = new FormData();
  form.append("identity", params.identityHex);
  form.append("file", params.file, params.file.name);
  const res = await fetch(`${BASE}/pgx/upload`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`pgx upload failed: ${res.status}`);
  return res.json();
}

export interface PgxFlag {
  gene: string;
  phenotype: string;
  medication: string;
  guidance: string;
  cpicLevel?: string;
}
export function getPgxFlags(identityHex: string): Promise<{ flags: PgxFlag[]; caveat: string }> {
  return req(`/pgx/flags?identity=${encodeURIComponent(identityHex)}`);
}

// ---- Adherence forecast (PRD §10.3) ----
export interface MissForecast {
  doseId: string;
  scheduledAt: string;
  pMiss: number;
}
export function adherenceForecast(identityHex: string): Promise<{ forecasts: MissForecast[] }> {
  return req(`/adherence/forecast?identity=${encodeURIComponent(identityHex)}`);
}

// ---- Side-effect attribution (PRD §10.3 PatternFinder) ----
export interface Attribution {
  medication: string;
  symptom: string;
  r: number;
  n: number;
  lagHours: number;
}
export function sideEffectPatterns(identityHex: string): Promise<{ patterns: Attribution[] }> {
  return req(`/patterns/side-effects?identity=${encodeURIComponent(identityHex)}`);
}

export { BASE as INFERENCE_BASE };
