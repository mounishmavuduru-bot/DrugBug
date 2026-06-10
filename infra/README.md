# DrugBug — infra

Local infrastructure for the Inference Service: Postgres 16 (static medical KB),
Redis (job queue/cache), and the inference service itself (built from
`../inference`). The SpacetimeDB module and the Next.js client run separately — see
the root [`README.md`](../README.md) quickstart.

## Bring it up

```bash
# from this directory
cp ../inference/.env.example ../inference/.env   # fill in what you have
docker compose up -d
docker compose ps                                # postgres + redis healthy, inference up
curl localhost:8000/health | jq                  # shows which models + integrations are live
```

With no credentials/weights you still get: RxNorm autocomplete, DDInter +
always-on mechanistic-overlay interaction checks, adherence forecasting
(population/heuristic), and side-effect patterns. Gated capabilities report
"unavailable" honestly (PRD §5.3) — see the root README's "what's real now"
table.

Useful operations:

```bash
docker compose logs -f inference     # tail the service
docker compose down                  # stop (keeps volumes / data)
docker compose down -v               # stop AND delete pgdata + redisdata
```

Data persists in the named volumes `pgdata` and `redisdata`.

## Run the knowledge-base ETL (PRD §13)

The ETL ingests the static reference datasets into Postgres. Run it once, then on
dataset releases. Each script is real, idempotent, and version-pins its dataset
(recorded in `kb_dataset_versions`); the schema is created automatically by
`etl/common.py`.

Run against the compose Postgres (exposed on `localhost:5432`):

```bash
cd ../inference
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export POSTGRES_URL=postgresql://drugbug:drugbug@localhost:5432/drugbug_kb

python etl/ingest_ddinter.py        --csv ddinter_*.csv              # DDInter 2.0 pairwise interactions
python etl/ingest_twosides.py       --tsv TWOSIDES.csv               # GNN drug-drug-SE labels
python etl/ingest_rxnorm.py         --ingredients-file ingredients.txt   # ingredient -> ATC class
python etl/ingest_pill_reference.py --csv pill_reference.csv         # pill physical attributes [+ --embeddings]
python etl/ingest_cpic.py           --from-api                       # CPIC guidance (or --csv)
```

(You can also `docker compose exec inference python etl/ingest_*.py ...` to run the
ETL inside the container — it already has the Postgres host wired to `postgres:5432`.)

**Licensing (PRD §13/§21):** DDInter is free for academic/research use; DrugBank
targets require a commercial license. Clear commercial terms (or substitute
fully-open equivalents) before commercial launch.

## Recall monitor

The inference service exposes `POST /jobs/recall-monitor`, a daily openFDA Drug
Enforcement poll that matches recalls to active meds and writes `record_recall_alert`
(PRD §10.7). Drive it on a schedule with cron / a platform scheduler, e.g.:

```bash
curl -X POST localhost:8000/jobs/recall-monitor
```

## GPU / training

The compose `inference` service is CPU-only (serving is CPU-cheap). Training the GNN
and pill models requires a CUDA GPU — see the commented GPU-reservation block in
`docker-compose.yml`, the root README quickstart step 4, and `inference/README.md`.
A Claude subscription is not training compute (PRD §11/§21).
