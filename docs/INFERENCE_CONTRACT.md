# DrugBug Inference Service — build contract

Python 3.11 + FastAPI service (PRD §6/§7/§10/§11/§12). Owns ALL ML, vision, and
external API calls; writes results back to SpacetimeDB via an allowlisted service
identity. **Real data only — no mock APIs, no fabricated content** (PRD §5.3).
Where a capability needs credentials/GPU that aren't present, return an explicit,
honest "unavailable" state — never a fake pass/fail (PRD §10.1 layer 5 pattern).

## Endpoints (must match the client in `client/lib/inference-client.ts`)

| Method | Path | Body / Query | Returns |
|---|---|---|---|
| GET  | `/health` | — | `{status, models: {...}, integrations: {...}}` |
| GET  | `/search/drugs?q=` | query | `{results: [{rxcui, name, genericName, synonym?, tty?}]}` — **RxNorm RxNav** `approximateTerm`/`drugs` |
| POST | `/interactions/check` | `{rxcuis: string[], identity}` | `{pairs:[{drugA,drugB,severity,mechanism,management,source,confidence?}], cascades:[{drugs,risk,dominantMechanism,explanation,source}], hasMajor, modelVersion, kbVersion}` — synchronous, no writeback |
| POST | `/interactions/recompute` | `{identity}` | `{status}` — pulls the user's meds from SpacetimeDB, runs KB+GNN+cascade, writes back via `record_interaction_result` |
| POST | `/scan` | multipart `scan_id, identity, scan_type, image` | `{scanId, status}` — runs pipeline async (Redis job), writes back via `record_scan_result` / `fail_scan` |
| POST | `/brief/generate` | `{identity, appt_id?, provider_type?}` | `{briefRef, status}` — composes real user data, Claude generates, store in object storage, `attach_brief` |
| POST | `/pgx/upload` | multipart `identity, file` | `{status}` — 23andMe/Ancestry raw → VCF → PharmCAT → `set_pgx_phenotypes` |
| GET  | `/pgx/flags?identity=` | query | `{flags:[{gene,phenotype,medication,guidance,cpicLevel?}], caveat}` |
| GET  | `/adherence/forecast?identity=` | query | `{forecasts:[{doseId,scheduledAt,pMiss}]}` |
| GET  | `/patterns/side-effects?identity=` | query | `{patterns:[{medication,symptom,r,n,lagHours}]}` |

CORS: allow the client origin. Identity is the SpacetimeDB identity hex string.

## SpacetimeDB writeback (service identity)

The service authenticates as an allowlisted identity and calls reducers over the
SpacetimeDB HTTP API:

```
POST {SPACETIME_HTTP}/v1/database/{DB}/call/{reducer}
Authorization: Bearer {SPACETIME_SERVICE_TOKEN}
Content-Type: application/json
Body: [arg1, arg2, ...]   // positional JSON args in reducer signature order
```

Implement `app/spacetime_writeback.py` with typed helpers for each writeback
reducer. Reducer signatures (arg order matters):

- `record_scan_result(scan_id:u64, identified_drug, identified_ndc, id_confidence:f64, authenticity, auth_layers(json str), raw_analysis(json str))`
- `fail_scan(scan_id:u64, reason)`
- `record_interaction_result(owner:Identity hex, pairs(json str), cascades(json str), model_version, kb_version)`
- `record_recall_alert(owner:Identity hex, med_id:u64, openfda_recall_id, severity, summary)`
- `set_pgx_phenotypes(owner:Identity hex, phenotypes_json)`
- `attach_brief(appt_id:u64, brief_ref)`

Bootstrap: after `spacetime publish`, the service's identity is granted once via
the `grant_service_identity(identity, label)` reducer (callable while the
allowlist is empty). Document this in the service README.

To READ a user's meds for recompute/brief, query the SpacetimeDB SQL HTTP API:
`POST {SPACETIME_HTTP}/v1/database/{DB}/sql` with `SELECT * FROM medications WHERE owner_identity = X`.

## Integrations (`app/integrations/`) — all real

- `rxnorm.py` — NLM RxNav (no key): `/REST/approximateTerm.json`, `/REST/rxcui/{}/related.json`, ATC class via `/REST/rxclass`. Drug autocomplete + class for missed-dose.
- `openfda.py` — openFDA NDC Directory (`/drug/ndc.json`) + Drug Enforcement (`/drug/enforcement.json`). API key optional (higher rate limit). NDC validity + recall checks.
- `dailymed.py` — DailyMed (no key): pill physical characteristics + SPL labeling.
- `anthropic.py` — Claude (`claude-sonnet-4` per PRD; if unavailable use the latest Sonnet) for (a) structured label/packaging vision analysis and (b) brief generation. Vision returns structured JSON (print quality, registration, micro-text, packaging consistency). Claude is NEVER used to compute interaction risk, identify the pill, or make the authenticity verdict (PRD §11). Requires `ANTHROPIC_API_KEY`; absent → that layer returns "unavailable".
- `dscsa_vrs.py` — `DSCSAVerificationProvider` interface against the GS1 VRS / Lightweight Messaging protocol. Real interface; returns explicit `serialized verification unavailable — ATP credentials not configured` unless `DSCSA_VRS_*` env present (PRD §10.1 layer 5).

## DrugScan pipeline (`app/models/pill_id/`) — PRD §10.1

Confidence-gated, multi-signal, write the per-layer breakdown into `auth_layers`:
1. Detection/segmentation (YOLO/Detectron2) — model def + load hook; if weights
   absent, degrade to whole-image + note it.
2. Imprint OCR (TrOCR/CRNN) — primary discriminative signal.
3. Visual embedding (ArcFace/bilinear-CNN) nearest-neighbor vs ePillID / C3PI gallery.
4. Attribute filters (shape/color/scoring/size) vs DailyMed.
5. Fusion + calibration (Platt/temperature scaling) → ranked candidates + calibrated confidence.
Counterfeit layers 1–4 real now (barcode GS1 DataMatrix decode server-side,
NDC validity, recall, Claude-vision physical anomaly); layer 5 credential-gated.
Aggregate verdict: `verified | inconclusive | suspect` with per-layer reasons.
**Safety gating:** above threshold → auto-identify; below → top-3 candidates +
require user confirmation. Never assert a single identity at low confidence.

## CascadeMap (`app/models/cascade_gnn/`) — PRD §10.2

- KB layer (always-on): DDInter 2.0 pairwise interactions from Postgres — every
  common pair gets an authoritative citable explanation independent of the model.
- GNN layer: R-GCN encoder + tensor/DEDICOM decoder (Decagon-style) + Deep
  Sets/Set-Transformer cascade head + mechanistic overlay (shared CYP pathway,
  additive QT, serotonergic load). Provide the PyG model definition + serving
  loader. If trained weights are absent, serving returns KB pairs + the
  deterministic mechanistic-overlay cascades (real, useful) and labels GNN
  predictions as unavailable — never invents probabilities.
- Mechanistic overlay must be a real, self-contained rule engine over a small
  bundled CYP/QT/serotonergic table (works with zero trained weights).
- `training/` : `build_graph.py`, `mine_faers_cascades.py`, `train_cascade_gnn.py`
  — real, runnable training code (GPU required; document it, do not fake-train).

## Other models

- `adherence/` — gradient-boosted trees (scikit-learn) per-user + population
  cold-start; features per PRD §10.3. Real training + serving on accumulated
  dose history (CPU).
- PatternFinder — statistical temporal correlation + lag analysis over
  (med, symptom); report r, n, lag. Correlational, explicitly labeled.
- `pgx/` — PharmCAT integration (Java subprocess). 23andMe/Ancestry raw → VCF →
  PharmCAT → CPIC phenotypes; map active meds → CPIC guidance. If PharmCAT jar
  absent, return honest "PharmCAT not installed" status. Surface the consumer-SNP
  limitation caveat (PRD §10.4).

## KB / ETL (`app/kb/`, `etl/`)

Postgres 16 access layer + ETL ingest scripts (DDInter, TWOSIDES, RxNorm class,
pill reference, CPIC) per PRD §13. Each ETL script is real and idempotent;
version-pin datasets. Recall monitor (`/jobs`) polls openFDA enforcement daily.

## Deliverables

`inference/app/{main.py, routes/*, models/*, integrations/*, kb/*,
spacetime_writeback.py}`, `inference/training/*`, `inference/etl/*`,
`inference/requirements.txt`, `inference/Dockerfile`, `inference/.env.example`,
`inference/README.md`. Code must import cleanly with the lightweight deps
(fastapi/uvicorn/httpx/pydantic/anthropic/numpy/scipy/scikit-learn/psycopg/redis/
pillow); heavy ML deps (torch/torch-geometric/detectron2/trocr) are imported
lazily inside the model modules and guarded so the service boots without them
(returning honest "model unavailable" states), with install instructions in the
README. Provide a `/health` that reports which models/integrations are live.
