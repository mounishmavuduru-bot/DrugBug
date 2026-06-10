# DrugBug Inference Service

Python 3.11 + FastAPI service that owns all ML, vision, and external-API work for
DrugBug, and writes results back to SpacetimeDB via an allowlisted service
identity (PRD §6/§7/§10/§11/§12; see `docs/INFERENCE_CONTRACT.md`).

**Real data only — no mock APIs, no fabricated content.** Where a capability
needs GPU or credentials that aren't present, the service returns an explicit,
honest "unavailable" state — never a fake pass/fail. `/health` reports exactly
which models and integrations are live.

## Boot (lightweight deps only)

The service boots with only the lightweight deps. Heavy ML deps
(torch/torch-geometric, detectron2/ultralytics, transformers/TrOCR,
pylibdmtx/pyzbar) are imported **lazily** inside their model modules and guarded
so the app starts without them.

```bash
cd inference
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt           # lightweight only
cp .env.example .env                       # fill in what you have
uvicorn app.main:app --host 0.0.0.0 --port 8000
# Or: docker build -t drugbug-inference . && docker run -p 8000:8000 --env-file .env drugbug-inference
```

Check live capabilities:

```bash
curl localhost:8000/health | jq
```

With no credentials/weights, you still get: RxNorm autocomplete, DDInter+overlay
interaction checks (KB needs Postgres; the mechanistic overlay is always-on),
adherence forecasting (population/heuristic), and side-effect patterns.

## Endpoints (match `client/lib/inference-client.ts`)

| Method | Path | Notes |
|---|---|---|
| GET  | `/health` | live models + integrations |
| GET  | `/search/drugs?q=` | RxNorm RxNav autocomplete |
| POST | `/interactions/check` | synchronous KB+GNN+overlay; returns `hasMajor`, `pairs`, `cascades` |
| POST | `/interactions/recompute` | reads user meds from STDB, writes `record_interaction_result` |
| POST | `/scan` | multipart; async pipeline; writes `record_scan_result`/`fail_scan` |
| POST | `/brief/generate` | composes real data, Claude generates, stores artifact, `attach_brief` |
| POST | `/pgx/upload` | raw genotype → VCF → PharmCAT → `set_pgx_phenotypes` |
| GET  | `/pgx/flags?identity=` | CPIC flags + consumer-SNP caveat |
| GET  | `/adherence/forecast?identity=` | per-dose `pMiss` |
| GET  | `/patterns/side-effects?identity=` | `{medication, symptom, r, n, lagHours}` |
| POST | `/jobs/recall-monitor` | daily openFDA enforcement poll → `record_recall_alert` |

## SpacetimeDB service-identity bootstrap

The service authenticates as an allowlisted identity and calls `record_*` /
`set_pgx_phenotypes` / `attach_brief` reducers over the HTTP API
(`app/spacetime_writeback.py`). Reads (user meds for recompute/brief/recall) use
the SQL HTTP API.

After deploying the module, grant the service's identity **once** (the
`grant_service_identity` reducer is callable by anyone only while the allowlist
is empty):

```bash
# 1) Deploy the module
cd ../module && spacetime build && spacetime publish drugbug

# 2) Obtain the service identity's hex + a bearer token for it. Easiest path:
#    create/login an identity dedicated to the service, then read its token.
spacetime login                                  # or use a service identity file
SERVICE_IDENTITY=$(spacetime identity list | awk '/<your service identity>/{print $1}')

# 3) Grant it once (while the allowlist is empty)
spacetime call drugbug grant_service_identity "${SERVICE_IDENTITY}" "inference-service"

# 4) Put the bearer token in inference/.env as SPACETIME_SERVICE_TOKEN, and set
#    SPACETIME_HTTP to the https:// form of the host the client uses over wss://
#    (default https://maincloud.spacetimedb.com), and SPACETIME_DB=drugbug.
```

Thereafter only an existing service identity may grant another (PRD §15
least-privilege; the service identity can only call the writeback reducers).

## Knowledge base + ETL (PRD §13)

Postgres 16 holds the static reference data. Run the idempotent ETL once, then on
dataset releases. Each script `--version`-pins its dataset and records it in
`kb_dataset_versions`.

```bash
export POSTGRES_URL=postgresql://drugbug:drugbug@localhost:5432/drugbug_kb
python etl/ingest_ddinter.py        --csv ddinter_*.csv            # DDInter 2.0 pairwise
python etl/ingest_twosides.py       --tsv TWOSIDES.csv             # GNN drug-drug-SE labels
python etl/ingest_rxnorm.py         --ingredients-file ingredients.txt   # ingredient → ATC class
python etl/ingest_pill_reference.py --csv pill_reference.csv [--embeddings embeddings.jsonl]
python etl/ingest_cpic.py           --from-api                     # CPIC guidance (or --csv)
```

Schema is created automatically by the ETL (`etl/common.py`).

**Licensing (PRD §13/§21):** DDInter is free for academic/research use; DrugBank
targets require a commercial license. Clear commercial terms (or substitute
fully-open equivalents) before commercial launch.

## Model training (GPU required — PRD §11/§21)

GNN + pill models train on a **CUDA GPU** (Colab Pro L4/A100, rented RunPod/Lambda/
Vast, or a local RTX 3090/4090). A Claude subscription does not provide training
compute. Serving inference is CPU-cheap. These scripts are real and runnable — not
fake-trained.

```bash
# Cascade GNN (Decagon-style R-GCN + DEDICOM + Deep Sets/Set-Transformer head)
python training/build_graph.py          --drug-target STITCH.tsv --ppi STRING.tsv --out graph.pt
python training/mine_faers_cascades.py  --faers-dir faers_ascii_2024q1 --out cascades.jsonl
python training/train_cascade_gnn.py    --graph graph.pt --cascades cascades.jsonl --out cascade_gnn.pt
#   -> set CASCADE_GNN_WEIGHTS=cascade_gnn.pt to serve model-predicted edges/cascades

# Pill recognition
python training/train_pill_embedder.py  --data ePillID/images --out pill_embedder.pt --gallery-out embeddings.jsonl
python training/train_imprint_ocr.py    --manifest imprints.jsonl --out trocr_imprint/
#   -> PILL_EMBEDDER_WEIGHTS=pill_embedder.pt, IMPRINT_OCR_WEIGHTS=trocr_imprint/
#   -> ingest embeddings.jsonl with ingest_pill_reference.py --embeddings
```

Until weights exist, CascadeMap serves KB pairs + the deterministic mechanistic
overlay (real, useful) and labels GNN predictions unavailable; the pill pipeline
degrades layer-by-layer with an honest per-layer breakdown.

## GPU / heavy-deps image

The default `Dockerfile` is the lightweight boot image. For the full ML
capabilities, extend it and install the heavy deps pinned to your CUDA/torch
version (see the commented block in `requirements.txt`), then mount/COPY the
trained weights and set the `*_WEIGHTS` env vars. Barcode decoding needs the
native `libdmtx`/`zbar` libs (already in the Dockerfile) plus `pylibdmtx`/`pyzbar`.

## Counterfeit verification layers (PRD §10.1)

1. **Barcode** — server-side GS1 2D DataMatrix decode → GTIN/NDC/serial/lot/expiry,
   GS1 AI structure + GTIN check-digit validation. (`pylibdmtx`/`pyzbar` optional.)
2. **NDC validity** — openFDA NDC Directory. (no key)
3. **Recall** — openFDA Drug Enforcement. (no key)
4. **Physical anomaly** — Claude Vision structured analysis (signal only, never the
   verdict). (needs `ANTHROPIC_API_KEY`)
5. **Serialized VRS** — `DSCSAVerificationProvider` against GS1 VRS / Lightweight
   Messaging. **Credential-gated:** requires ATP status + a VRS provider. Absent →
   "serialized verification unavailable — ATP credentials not configured".

Aggregate verdict: `verified | inconclusive | suspect` with the per-layer
breakdown written to `auth_layers`. Above the confidence threshold → auto-identify;
below → top-3 candidates requiring user confirmation (never a single low-confidence
identity).

## PharmacoFit (PRD §10.4)

`/pgx/upload` converts a 23andMe/Ancestry raw genotype → VCF → runs PharmCAT (Java
subprocess) → CPIC phenotypes → maps active meds to CPIC guidance. Set
`PHARMCAT_JAR` (and have `java` on PATH). Absent → honest "PharmCAT not installed".
Every result carries the consumer-SNP-array limitation caveat. `set_pgx_phenotypes`
is rejected by the module unless the subject has granted consent.

## Safety posture

Every clinical-adjacent output is decision-support to confirm with a pharmacist/
prescriber, with visible confidence. Claude is never used to compute interaction
risk, identify the pill, or make the authenticity verdict (PRD §11) — those are
owned by the dedicated models and verification layers.
