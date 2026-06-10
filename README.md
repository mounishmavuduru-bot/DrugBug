# DrugBug

> The only medication app a person should need: daily-use scheduling, reminders,
> logging, and refills fused with research-grade ML safety systems — multi-drug
> interaction-cascade detection (GNN), pill ID + counterfeit verification (CV),
> pharmacogenomic personalization (PharmCAT), and adherence/side-effect prediction.

Consumer medication safety + management platform — web PWA + native iOS/Android via
Capacitor. This is the top-level repo. The full product spec lives in `PRD.md`
(referenced throughout as PRD §N).

**Safety posture (PRD §5/§16):** every clinical-adjacent output is decision-support,
shown with calibrated confidence and a "confirm with your pharmacist or prescriber"
framing. Nothing in this product diagnoses disease or replaces a clinician. Low-confidence
ML outputs route to a deterministic fallback or explicit human confirmation.

---

## Architecture — three cooperating systems (PRD §6)

```
┌─────────────────────────────────────────────────────────────┐
│  CLIENT  (Next.js + TS + Tailwind v4 + shadcn-style UI)      │
│  Packaged as: installable PWA + Capacitor iOS/Android shells  │
│  - SpacetimeDB TypeScript SDK (realtime subscriptions)        │
│  - Calls Inference Service over HTTPS for ML/vision/external  │
│  - Web Push (VAPID) + Capacitor native notifications          │
└───────────────┬──────────────────────────┬───────────────────┘
                │ realtime (WebSocket)       │ HTTPS (REST)
                ▼                            ▼
┌──────────────────────────┐   ┌────────────────────────────────┐
│  SPACETIMEDB MODULE       │   │  INFERENCE SERVICE (Python)     │
│  (Rust → WASM)            │   │  FastAPI + PyTorch + PyG         │
│  - Tables (user state)    │   │  - GNN cascade model (served)    │
│  - Reducers (CRUD/logic)  │◄──┤  - Pill recognition pipeline     │
│  - RLS read filters       │   │  - Pharmacogenomics (PharmCAT)   │
│  - OIDC identity per user │   │  - Adherence + pattern models    │
│  - Realtime sync to all   │   │  - openFDA / DSCSA-VRS / RxNorm  │
│    subscribed clients     │   │  - Anthropic Claude (vision,     │
│                           │   │    brief generation)             │
│  Service identity lets the│   │  - Writes results back to        │
│  inference service call   │──►│    SpacetimeDB via reducers      │
│  reducers to persist ML   │   │                                  │
│  outputs.                 │   │  Backed by:                      │
└──────────────────────────┘   │   - Postgres (static medical KB) │
                               │   - Object storage (images, R2/S3)│
                               │   - Redis (job queue / cache)      │
                               └────────────────────────────────────┘
```

**Why this split.** SpacetimeDB collapses database + server logic and gives
automatic realtime multi-device sync — ideal for the patient/caregiver shared-state
problem. Its reducers run as sandboxed WASM and cannot make arbitrary outbound HTTP,
and heavy PyTorch/GPU inference does not belong in WASM. So: SpacetimeDB owns all
user/transactional state + realtime sync; a separate Python Inference Service owns
ML, vision, and all external API calls, and writes results back into SpacetimeDB
through a service identity calling reducers. Large static medical knowledge bases
(interactions, pill reference, CPIC rules) live in the Inference Service's Postgres,
keeping the realtime layer lean.

Contracts: client foundation API in [`docs/CLIENT_FOUNDATION.md`](docs/CLIENT_FOUNDATION.md);
inference endpoint/writeback contract in [`docs/INFERENCE_CONTRACT.md`](docs/INFERENCE_CONTRACT.md).

---

## What's real now vs. credential / GPU-gated

This product is built to PRD §5.3 ("real data only — no mock APIs, no fabricated
content"). Where a capability needs credentials or GPU that aren't present, the code
returns an explicit, honest **"unavailable"** state — never a fake pass/fail.

### Real and working today (no credentials, no GPU)

- **Realtime data layer** — SpacetimeDB module: all tables, CRUD reducers, scheduler
  timers (dose-horizon + missed-sweep), write-path authorization, caregiver links,
  audit log. Builds to WASM and publishes.
- **Client** — Next.js PWA: Today / meds / scan / cascade / insights / pharmacofit /
  caregiver / settings surfaces wired to live SpacetimeDB subscriptions; deterministic
  Missed-Dose Recovery engine; on-device barcode decode (`@zxing`); web-push plumbing.
- **Inference service boots lightweight** and serves: `/health`, RxNorm drug
  autocomplete, DDInter + always-on mechanistic-overlay interaction checks (KB needs
  Postgres; the CYP/QT/serotonergic overlay is self-contained), adherence forecasting
  (population/heuristic cold-start), side-effect pattern stats, brief generation (when
  `ANTHROPIC_API_KEY` is set).
- **Counterfeit layers 1–4** — GS1 DataMatrix decode, openFDA NDC validity, openFDA
  recall/enforcement, Claude-Vision physical-anomaly signal (layer 4 needs
  `ANTHROPIC_API_KEY`).

### Gated — honest "unavailable" until the gate is satisfied

| Capability | Gate | Without it |
|---|---|---|
| Cascade GNN model-predicted edges/cascades | trained weights (`CASCADE_GNN_WEIGHTS`), **GPU to train** | CascadeMap serves KB pairs + deterministic mechanistic-overlay cascades; GNN predictions labeled unavailable |
| Pill detection / imprint OCR / visual embedding | trained weights + heavy ML deps (torch, detectron2/YOLO, TrOCR) | pipeline degrades layer-by-layer with an honest per-layer breakdown |
| Counterfeit layer 5 (serialized VRS) | **ATP status + VRS provider** (`DSCSA_VRS_*`) | "serialized verification unavailable — ATP credentials not configured" |
| PharmacoFit (PGx) | PharmCAT jar + Java (`PHARMCAT_JAR`) | "PharmCAT not installed" |
| Claude vision + brief generation | `ANTHROPIC_API_KEY` | those layers report unavailable |
| Object storage (R2/S3) | account keys | local-dir fallback for artifacts |
| **RLS read-enforcement** | upstream **spacetimedb 2.4.1** RLS read-path (in progress) | write-path authz enforced; read filters land automatically when the platform ships RLS — see [`module/README.md`](module/README.md#security-note--rls-read-enforcement-is-still-landing-upstream) |

### Founder action items — blocking real-world launch (PRD §21)

| Item | Why | Status |
|---|---|---|
| GPU access for training | GNN + pill models train on CUDA; a Claude subscription is not compute | Required before model training |
| DrugBank / DDInter commercial license review | Commercial use terms differ from academic | Required before commercial launch |
| ATP status + VRS provider | Enables serialized DSCSA verification (DrugScan layer 5); requires state dispenser/wholesaler licensure — a DEA number is not sufficient | Optional; layers 1–4 ship without it |
| Regulatory (SaMD) + legal counsel | Pill ID and risk analysis likely constitute a medical device | Required before commercial launch |
| Clinical validation study | Report sensitivity/specificity for pill ID + cascade detection on labeled ground truth | Required before clinical claims |
| HIPAA-aligned + genetic-privacy compliance review | Handling PHI + genomic data | Required before launch |

---

## Monorepo layout (PRD §19)

```
drugbug/
├── client/            # Next.js PWA + Capacitor shells (see client/README is the default CNA one)
│   ├── app/(app)/     # today, meds, scan, cascade, insights, pharmacofit, caregiver, settings
│   ├── components/    # med/ scan/ cascade/ insights/ caregiver/ pharmacofit/ today/ settings/ shared/ ui/ app/
│   ├── lib/
│   │   ├── spacetime/        # generated SpacetimeDB TS bindings (do not hand-edit)
│   │   ├── db.ts             # connection + identity helpers
│   │   ├── hooks.ts          # identity-scoped realtime data hooks
│   │   ├── inference-client.ts  # typed calls to the Python service
│   │   ├── missed-dose.ts    # deterministic Missed-Dose Recovery engine
│   │   └── push.ts           # web push + Capacitor notifications
│   └── public/        # icons, manifest.webmanifest, sw.js (service worker)
│
├── module/            # SpacetimeDB Rust module → WASM  (see module/README.md)
│   ├── src/{lib,tables,reducers,auth,rls,scheduler,util}.rs
│   └── Cargo.toml
│
├── inference/         # Python FastAPI service  (see inference/README.md)
│   ├── app/{main.py, config.py, routes/, models/, integrations/, kb/,
│   │        spacetime_writeback.py, jobs.py, patterns.py, storage.py}
│   ├── training/      # build_graph, mine_faers_cascades, train_cascade_gnn,
│   │                  #   train_pill_embedder, train_imprint_ocr  (GPU required)
│   ├── etl/           # ingest_ddinter / twosides / rxnorm / pill_reference / cpic
│   ├── Dockerfile     # lightweight boot image
│   └── requirements.txt
│
├── infra/             # docker-compose + infra README  (see infra/README.md)
├── docs/              # CLIENT_FOUNDATION.md, INFERENCE_CONTRACT.md
├── .env.example       # every env var across all services
└── PRD.md             # full product spec
```

---

## End-to-end local dev quickstart

Prereqs: SpacetimeDB CLI, Node 20+, Docker (with `docker compose`). GPU and external
credentials are optional — everything below runs without them, with gated features
reporting "unavailable" (see the table above).

Copy env templates first:

```bash
cp .env.example .env                       # shared reference for all services
cp client/.env.local.example client/.env.local
cp inference/.env.example inference/.env
```

### 1) SpacetimeDB module — build, publish, generate bindings, grant the service identity

```bash
curl -sSf https://install.spacetimedb.com | sh
spacetime start                            # local instance (separate terminal)

cd module
spacetime build
spacetime publish drugbug

# regenerate the client TS bindings (already committed; rerun after schema changes)
spacetime generate --lang typescript --out-dir ../client/lib/spacetime --project-path .

# allowlist the Inference Service identity ONCE (callable while the allowlist is empty)
spacetime login
SERVICE_IDENTITY=$(spacetime identity list | awk '/<your service identity>/{print $1}')
spacetime call drugbug grant_service_identity "${SERVICE_IDENTITY}" "inference-service"
# put that identity's bearer token in inference/.env as SPACETIME_SERVICE_TOKEN
```

Details + the RLS security note: [`module/README.md`](module/README.md).

### 2) Client — Next.js dev server

```bash
cd client
npm install
# client/.env.local needs the NEXT_PUBLIC_* values:
#   NEXT_PUBLIC_STDB_URI=ws://localhost:3000   (or wss://maincloud.spacetimedb.com)
#   NEXT_PUBLIC_STDB_DB=drugbug
#   NEXT_PUBLIC_INFERENCE_URL=http://localhost:8000
#   NEXT_PUBLIC_VAPID_PUBLIC_KEY=<your VAPID public key>
npm run dev                                # http://localhost:3000
```

Note: the client targets a build of Next.js with breaking changes from upstream —
see `client/AGENTS.md` before editing client code. The client foundation contract is
[`docs/CLIENT_FOUNDATION.md`](docs/CLIENT_FOUNDATION.md).

### 3) Inference service + datastores — docker compose

Brings up Postgres 16 + Redis + the inference service (built from `../inference`):

```bash
cd infra
docker compose up -d
curl localhost:8000/health | jq           # shows which models + integrations are live
```

Or run the service directly against compose's Postgres/Redis:

```bash
cd inference
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt           # lightweight deps only
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

See [`inference/README.md`](inference/README.md) and [`infra/README.md`](infra/README.md).

### 4) Knowledge-base ETL + model training

ETL ingests the static medical KB into Postgres (run once, then on dataset releases).
Each script is real and idempotent and version-pins its dataset (PRD §13):

```bash
cd inference
export POSTGRES_URL=postgresql://drugbug:drugbug@localhost:5432/drugbug_kb
python etl/ingest_ddinter.py        --csv ddinter_*.csv
python etl/ingest_twosides.py       --tsv TWOSIDES.csv
python etl/ingest_rxnorm.py         --ingredients-file ingredients.txt
python etl/ingest_pill_reference.py --csv pill_reference.csv
python etl/ingest_cpic.py           --from-api
```

Model training requires a **CUDA GPU** (Colab Pro L4/A100, rented RunPod/Lambda/Vast,
or a local RTX 3090/4090). A Claude subscription is not training compute (PRD §11/§21).
Serving inference is CPU-cheap. The scripts are real and runnable — not fake-trained.

```bash
python training/build_graph.py         --drug-target STITCH.tsv --ppi STRING.tsv --out graph.pt
python training/mine_faers_cascades.py --faers-dir faers_ascii_2024q1 --out cascades.jsonl
python training/train_cascade_gnn.py   --graph graph.pt --cascades cascades.jsonl --out cascade_gnn.pt
python training/train_pill_embedder.py --data ePillID/images --out pill_embedder.pt --gallery-out embeddings.jsonl
python training/train_imprint_ocr.py   --manifest imprints.jsonl --out trocr_imprint/
# then set CASCADE_GNN_WEIGHTS / PILL_EMBEDDER_WEIGHTS / IMPRINT_OCR_WEIGHTS in inference/.env
```

Until weights exist, CascadeMap serves KB pairs + the deterministic mechanistic
overlay and labels GNN predictions unavailable; the pill pipeline degrades
layer-by-layer with an honest per-layer breakdown.

---

## Environment variables

The complete set across all services is documented in [`.env.example`](.env.example),
with the client-only `NEXT_PUBLIC_*` subset in
[`client/.env.local.example`](client/.env.local.example) and the service env in
`inference/.env.example`.

## License / commercial note

Some datasets (DrugBank, DDInter) and DSCSA-VRS verification carry commercial-use
terms or licensure requirements that must be cleared before commercial launch — see
the founder action items above and PRD §13/§16/§21. This repo is a build-and-validate
plan, not legal advice.
