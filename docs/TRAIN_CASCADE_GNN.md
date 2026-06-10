# Training the DrugBug Cascade GNN — End-to-End Runbook

This runbook trains the DrugBug Cascade GNN (Decagon-style R-GCN + DEDICOM decoder
+ Deep Sets / Set-Transformer cascade head) and deploys the resulting checkpoint to
the inference service. Every command, flag, env var, table name, and checkpoint key
below is taken directly from the repository source. Where a feature is *not*
implemented in the code, it is explicitly flagged.

Repo training scripts:

- `/Users/Satyasai/drugbug/inference/training/build_graph.py`
- `/Users/Satyasai/drugbug/inference/training/mine_faers_cascades.py`
- `/Users/Satyasai/drugbug/inference/training/train_cascade_gnn.py`

Serving code that consumes the checkpoint:

- `/Users/Satyasai/drugbug/inference/app/models/cascade_gnn/loader.py`
- `/Users/Satyasai/drugbug/inference/app/models/cascade_gnn/engine.py`
- `/Users/Satyasai/drugbug/inference/app/models/cascade_gnn/model.py`
- `/Users/Satyasai/drugbug/inference/app/config.py`

---

## 0. TL;DR + the serving fallback (training is an upgrade, not a blocker)

The inference service runs **with zero trained weights**. If `CASCADE_GNN_WEIGHTS`
is unset, or `torch` / `torch_geometric` are not installed, the GNN layer reports
itself unavailable and the service still returns:

- **KB pairs** (`source: "kb"`) — DDInter pairwise interactions from Postgres, always on.
- **Mechanistic overlay cascades** (`source: "mechanistic"`) — deterministic, rule-based, always on.

The loader **never fabricates probabilities**. A valid trained checkpoint is strictly
*additive*: it turns on `source: "model"` pairs and cascades layered on top of the
always-on KB + overlay output. So you can ship the service today and add the GNN later.

The full pipeline (each step feeds the next):

1. **ETL** TWOSIDES + DDInter into Postgres (`etl/ingest_twosides.py`, `etl/ingest_ddinter.py`).
2. **`build_graph.py`** → `graph.pt` (+ `graph.pt.meta.json`) — reads `twosides_associations` from Postgres + optional drug-target / PPI TSVs.
3. **`mine_faers_cascades.py`** → `cascades.jsonl` — mines multi-drug cascade labels from FAERS ASCII files.
4. **`train_cascade_gnn.py`** → `cascade_gnn.pt` — consumes `graph.pt` + `cascades.jsonl`, trains on GPU.
5. **Deploy** — set `CASCADE_GNN_WEIGHTS=cascade_gnn.pt`, restart the service.

Minimal end-to-end command sequence (details in each section):

```bash
export POSTGRES_URL=postgresql://user:pass@localhost:5432/drugbug

# ETL (one time)
python etl/ingest_twosides.py --tsv TWOSIDES.csv
python etl/ingest_ddinter.py  --csv ddinter_downloads_code_A.csv

# Graph (TWOSIDES from Postgres; drug-target/PPI optional)
python training/build_graph.py --drug-target STITCH_drug_protein.tsv --ppi STRING_protein_links.tsv --min-prr 2.0 --out graph.pt

# Cascade labels
python training/mine_faers_cascades.py --faers-dir faers_ascii_2024q1 --min-drugs 3 --out cascades.jsonl

# Train (GPU)
python training/train_cascade_gnn.py --graph graph.pt --cascades cascades.jsonl --epochs 40 --emb-dim 32 --lr 0.01 --neg-ratio 1 --cascade-head deepsets --out cascade_gnn.pt

# Deploy
export CASCADE_GNN_WEIGHTS=$(pwd)/cascade_gnn.pt
# restart the uvicorn process
```

> **Known data mismatch (read this before trusting cascade labels).**
> `build_graph.py` keys drug nodes as `drug:{rxcui}` (RxNorm CUI from `twosides_associations`).
> But `mine_faers_cascades.py` emits `drugs` as **lowercased FAERS drug *names***. In
> `train_cascade_gnn.py` each cascade drug `d` is resolved via
> `node_index.get(f'drug:{d}')` then a `node_index.get(str(d))` fallback. Because the
> graph keys are RxCUIs and the cascade drugs are names, **most cascade drugs will not
> resolve** and those examples are dropped (an example is kept only if ≥ 2 ids match).
> See §6 and §10 for the implication and mitigations. This is a real limitation of the
> current code, not a misconfiguration.

---

## 1. Provision a GPU

Training **requires a CUDA GPU** (`train_cascade_gnn.py` prints a WARNING and falls
back to CPU if `torch.cuda.is_available()` is False — usable for a tiny smoke test,
not a real run). Serving inference is CPU-cheap and does not need a GPU.

| Option | GPU | ~Price (Jun 2026) | Notes |
|---|---|---|---|
| **RunPod (recommended)** | RTX 4090 / 3090 24 GB | $0.34–0.69/hr | Per-second billing, no session timeout, stable. One run ≈ $3–8. |
| RunPod | A100 80 GB | $1.19–1.79/hr | Removes VRAM pressure; skip mini-batch tuning. ~$5–14/run. |
| Vast.ai | RTX 3090/4090 | from $0.07–0.59/hr | Cheapest floor, but preemption risk on multi-hour jobs. |
| Lambda Labs | A100 40 GB / H100 | $1.79–2.99/hr | 99.9% uptime SLA, US-only, priciest. |
| Local RTX 3090/4090 24 GB | — | one-time ~$700–900 | Zero marginal cost; best for iterative runs. |
| Google Colab Pro | T4/L4/A100 | $11.99/mo | **Not recommended** — session limits/disconnects kill overnight jobs. |

**Recommendation:** RunPod RTX 4090 (24 GB) with a CUDA-tagged image such as
`runpod/pytorch:2.5.1-py3.11-cuda12.1.1-devel-ubuntu22.04`. 24 GB holds this graph
with `emb-dim ≤ 64`. Expect roughly **6–18 hours** for a full Decagon-scale run at
40–200 epochs; this repo's default is 40 epochs and full-graph (not mini-batched)
training, so memory scales with `num_nodes × num_relations`.

> The Cascade GNN's encoder uses `RGCNConv` with `num_bases = min(30, num_relations)`
> and `hidden = 64`, outputting `emb_dim` (default 32). VRAM scales with the number of
> relations (one relation per distinct TWOSIDES side-effect, plus `drug_target` + `ppi`).
> A TWOSIDES-only graph can have thousands of relations — keep `--emb-dim` at 32 on
> 24 GB and bump only if you have an A100.

---

## 2. Environment setup

### 2.1 Clone + lightweight deps (boots the service, no ML)

```bash
# on the GPU box
git clone <your-drugbug-remote> drugbug
cd drugbug/inference

python -m venv .venv
source .venv/bin/activate

pip install -r requirements.txt        # lightweight only — NOT the heavy ML deps
cp .env.example .env                    # fill in what you have
```

`requirements.txt` pins the lightweight runtime (fastapi 0.115.6, uvicorn 0.34.0,
pydantic 2.10.4, psycopg[binary] 3.2.3, numpy 2.2.1, anthropic 0.42.0, etc.). The
heavy ML deps are **commented out** in `requirements.txt` and must be installed
explicitly for training.

### 2.2 Install torch + PyG pinned to your CUDA (the exact training deps)

The repo pins `torch==2.5.1` and `torch-geometric==2.6.1` (commented in
`requirements.txt`). Install them with the matching CUDA wheels. Pick the CUDA line
that matches your pod's driver (CUDA 12.1 is the most widely available).

**CUDA 12.1:**

```bash
pip install torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1 \
    --index-url https://download.pytorch.org/whl/cu121

pip install torch-geometric==2.6.1

# PyG C++ extensions. NOTE: the wheel URL uses "2.5.0" for ALL torch 2.5.x — this is
# intentional per PyG docs, not a mismatch. Do NOT mix CUDA versions across wheels.
pip install pyg_lib torch_scatter torch_sparse torch_cluster torch_spline_conv \
    -f https://data.pyg.org/whl/torch-2.5.0+cu121.html
```

**CUDA 12.4** (use if your pod image ships CUDA 12.4):

```bash
pip install torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1 \
    --index-url https://download.pytorch.org/whl/cu124
pip install torch-geometric==2.6.1
pip install pyg_lib torch_scatter torch_sparse torch_cluster torch_spline_conv \
    -f https://data.pyg.org/whl/torch-2.5.0+cu124.html
```

> `torch-scatter` / `torch-sparse` / `pyg-lib` are **not** pinned anywhere in the repo
> — they are PyG companion packages you install yourself, matched to your torch+CUDA.
> `torch_geometric.nn.RGCNConv` (which the model uses) iterates over relations and is
> the memory-efficient choice; avoid `FastRGCNConv` on 24 GB cards.

### 2.3 Verify CUDA is visible (do this before training)

```bash
python -c "import torch; print('CUDA available:', torch.cuda.is_available()); print('CUDA version:', torch.version.cuda); print('GPU:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'none')"
nvidia-smi
```

Expected: `CUDA available: True`, a version like `12.1`, and your GPU name. Also confirm PyG imports:

```bash
python -c "import torch_geometric; from torch_geometric.nn import RGCNConv; print('pyg ok', torch_geometric.__version__)"
```

If `is_available()` is `False`: confirm the pod was launched with a CUDA-tagged image,
run `nvidia-smi` to confirm the driver sees the GPU, and check `torch.version.cuda`
matches the driver's CUDA.

---

## 3. Stand up Postgres + run the KB ETL

`build_graph.py` reads the `twosides_associations` table directly from Postgres. The
KB serving layer (and DDInter pairs) read `ddinter_interactions`. Both tables are
created by the ETL scripts (schema in `etl/common.py`, run by `ensure_schema` before
every ingest).

### 3.1 Postgres + the required env var

```bash
# any reachable Postgres works; local example:
# docker run -d --name drugbug-pg -e POSTGRES_PASSWORD=pass -e POSTGRES_USER=user -e POSTGRES_DB=drugbug -p 5432:5432 postgres:16

export POSTGRES_URL=postgresql://user:pass@localhost:5432/drugbug
```

`POSTGRES_URL` is **required** by both the ETL (`etl/common.py connect()` → `SystemExit`
if unset) and `build_graph.py` (`_pg_url()` → `SystemExit('POSTGRES_URL required')`
if unset).

### 3.2 TWOSIDES ETL (feeds build_graph.py)

```bash
python etl/ingest_twosides.py --tsv TWOSIDES.csv          # required: --tsv (single file)
#   optional: --version 0.1   --batch 5000
```

- Accepts CSV **or** TSV — delimiter is auto-sniffed from the first 4096 bytes.
- Reads (case-insensitive) drug A from `drug_1_rxnorm_id | drug_1_rxcui | drug_a_rxcui | drug_1_concept_id`, drug B from the `drug_2_*` equivalents, side effect from `condition_meddra_id | event | side_effect | condition_concept_name`, and optional `PRR` / `ROR`.
- Writes `twosides_associations(drug_a_rxcui, drug_b_rxcui, side_effect, prr, ror)`, PK `(drug_a_rxcui, drug_b_rxcui, side_effect)`, upserting in batches of `--batch` (default 5000).

### 3.3 DDInter ETL (powers the always-on KB layer)

```bash
python etl/ingest_ddinter.py --csv ddinter_downloads_code_A.csv   # --csv is repeatable
#   e.g. --csv code_A.csv --csv code_B.csv   optional: --version 2.0
```

- Writes `ddinter_interactions(ddinter_id, drug_a_name, drug_b_name, severity, mechanism, management, source)`, PK `(drug_a_name, drug_b_name)`.
- Severity normalized to `major | moderate | minor | contraindicated` (anything else → `minor`).
- This is what `app/kb/postgres.py` serves as `source: "kb"` pairs at request time. DDInter is *not* consumed by `build_graph.py`, but it is what makes `/interactions/check` useful before any GNN exists.

### 3.4 Verify the table build_graph will read

```bash
psql "$POSTGRES_URL" -c "SELECT count(*) FROM twosides_associations;"
psql "$POSTGRES_URL" -c "SELECT drug_a_rxcui, drug_b_rxcui, side_effect, prr FROM twosides_associations LIMIT 5;"
```

`build_graph.py` runs: `SELECT drug_a_rxcui, drug_b_rxcui, side_effect FROM twosides_associations WHERE prr IS NULL OR prr >= %s` with the parameter = `--min-prr` (default 2.0). `main()` applies **no LIMIT** — the full filtered table is loaded.

---

## 4. Acquire datasets

| Dataset | Used by | Where | Format | License (verify before commercial use) |
|---|---|---|---|---|
| **TWOSIDES** | ETL → `twosides_associations` → `build_graph.py` | `TWOSIDES.csv.xz` from the Tatonetti S3 bucket (`tatonettilab-resources` → `nsides/`) | xz-compressed CSV; cols `drug_1_rxnorm`, `drug_2_rxnorm`, `condition_meddra_id`, A/B/C/D, `PRR`, `PRR_error` | **No explicit data license.** Research-available; contact tatonetti-lab before commercial use. |
| **FAERS** quarterly ASCII | `mine_faers_cascades.py` | `fis.fda.gov/extensions/FPD-QDE-FAERS/` ZIP per quarter | `$`-delimited ASCII files (`DRUG`, `REAC`, `OUTC`, `DEMO`, …) | **Public domain / CC0.** Fully open incl. commercial. |
| **STITCH 5** (drug-target) | optional `--drug-target` TSV for `build_graph.py` | `stitch.embl.de/download/...protein_chemical.links.detailed.v5.0/9606...tsv.gz` | gzipped TSV | **CC BY 4.0** — commercial OK with attribution. (TLS cert issues in 2026; use `wget --no-check-certificate` or string-db mirror.) |
| **DrugBank** (drug-target) | optional `--drug-target` TSV | register at `go.drugbank.com` (academic downloads paused as of Jun 2026) | CSV (Drug-Target Identifiers) | Drug-target CSV is **CC BY-NC 4.0** (non-commercial). Vocabulary/Structures subsets are CC0. |
| **STRING 12.5** (PPI) | optional `--ppi` TSV | `string-db.org/cgi/download` → Homo sapiens → `9606.protein.links.v12.0.txt.gz` | gzipped space-separated TXT | **CC BY 4.0** — commercial OK. No login. |
| **BioSNAP PP-Decagon** (PPI) | optional `--ppi` TSV | `snap.stanford.edu/biodata/files/PP-Decagon_ppi.csv.gz` | gzipped CSV edgelist | **No explicit license** — prefer STRING for unambiguous terms (PP-Decagon is derived from STRING). |

### What `build_graph.py` actually does with the TSVs

`load_tsv_edges()` reads tab-separated files using **column 0 as node A and column 1
as node B**, and **always skips the first line as a header**. Lines with fewer than
`max(a_col, b_col)+1` fields are skipped. So whatever STITCH/DrugBank/STRING/BioSNAP
file you feed must have the two node identifiers in its **first two tab-separated
columns**. STRING's `9606.protein.links.v12.0.txt.gz` is **space**-delimited — convert
to tab first (e.g. `zcat file.txt.gz | tr ' ' '\t' > STRING_protein_links.tsv`) or it
will not parse as a TSV.

Both TSV inputs are **optional**. With neither, you get a TWOSIDES-only drug-drug
graph (no protein nodes, no `drug_target` / `ppi` relations).

---

## 5. Build the graph

```bash
# Full graph: TWOSIDES (Postgres) + drug-target + PPI
POSTGRES_URL=postgresql://user:pass@localhost:5432/drugbug \
python training/build_graph.py \
  --drug-target STITCH_drug_protein.tsv \
  --ppi STRING_protein_links.tsv \
  --min-prr 2.0 \
  --out graph.pt

# TWOSIDES-only graph (drug-target/PPI omitted — both optional)
POSTGRES_URL=postgresql://user:pass@localhost:5432/drugbug \
python training/build_graph.py --out graph.pt
```

**Exact flags** (none required; all have defaults):

| Flag | Type | Default | Meaning |
|---|---|---|---|
| `--drug-target` | path | `None` | STITCH/DrugBank drug-protein TSV (optional) |
| `--ppi` | path | `None` | STRING/BioSNAP protein-protein TSV (optional) |
| `--min-prr` | float | `2.0` | TWOSIDES PRR threshold (rows with `prr IS NULL OR prr >= min_prr` are kept) |
| `--out` | path | `graph.pt` | output checkpoint path |

**Construction logic:**

- Drug nodes are keyed `drug:{rxcui}` (`node_type='drug'`); protein nodes `protein:{id}` (`node_type='protein'`).
- One relation per distinct side-effect, named `se:{side_effect}`, plus `drug_target` and `ppi`.
- All edges are added **bidirectionally** (src→dst and dst→src), so the stored edge count is **2× the source pairs**.
- TWOSIDES → drug-drug `se:` edges; drug-target TSV → drug-protein `drug_target` edges; PPI TSV → protein-protein `ppi` edges.

**Outputs:**

- `graph.pt` — `torch.save` of a dict: `edge_index` (`long [2, num_edges]`), `edge_type` (`long [num_edges]`), `node_index` (`dict[str,int]`), `node_type` (`dict[str,str]`), `relations` (`list[str]`), `num_nodes`, `num_relations`.
- `graph.pt.meta.json` — sidecar with `num_nodes`, `num_relations`, `num_edges` (`json.dump`, indent 2).

**Sanity check:**

```bash
cat graph.pt.meta.json          # confirm num_nodes / num_relations / num_edges are non-trivial
python -c "import torch,json; g=torch.load('graph.pt', weights_only=True); print('relations:', len(g['relations']), 'nodes:', g['num_nodes'], 'edges:', g['edge_index'].shape)"
```

If `num_relations` is huge (thousands), that is expected for TWOSIDES (one relation
per side-effect) and drives VRAM — keep `--emb-dim 32` at train time.

---

## 6. Mine FAERS cascade labels

```bash
python training/mine_faers_cascades.py \
  --faers-dir faers_ascii_2024q1 \
  --min-drugs 3 \
  --out cascades.jsonl
```

**Exact flags:**

| Flag | Type | Default | Required |
|---|---|---|---|
| `--faers-dir` | path | — | **yes** |
| `--min-drugs` | int | `3` | no |
| `--out` | path | `cascades.jsonl` | no |

**What it reads:** the `DRUG`, `REAC`, and `OUTC` files from `--faers-dir`. Files are
located by `_find()`, which scans the directory for a name starting with the base
(case-insensitive) ending in `.txt`, falling back to `{base}.txt`. Files are read
`encoding='latin-1`, `$`-delimited, header on the first line. No Postgres, no env vars,
no GPU. (`DEMO` is mentioned in the docstring but is **not** read by `mine()`.)

**Key thresholds (from the code):**

- `SERIOUS_OUTCOMES = {'DE','LT','HO','DS','CA','RI'}`.
- Only cases with `len(drugs) >= min_drugs` are counted; the combo is truncated to the first `min_drugs` drugs alphabetically: `frozenset(sorted(drugs)[:min_drugs])`.
- Minimum support: skip `(combo, outcome)` where co-occurrence count `a < 3`.
- PRR threshold: skip if `prr is None or prr < 2.0`. Labels sorted by `prr` descending.

**Output JSONL** — one object per line:

```json
{"drugs": ["aspirin","lisinopril","metformin"], "outcome": "renal failure", "prr": 4.21, "ror": 5.07, "n": 12}
```

`drugs` = sorted lowercased FAERS **drug-name strings**; `outcome` = lowercased REAC
PT; `prr`/`ror` rounded to 3 (ror may be `null`); `n` = co-occurrence count. Prints
`mined {N} cascade labels -> {out}`.

> **Carry-forward of the §0 mismatch.** Because `drugs` here are *names* while the
> graph is keyed by *RxCUI*, `train_cascade_gnn.py` will fail to resolve most cascade
> drugs to node ids. Mitigations: (a) accept that cascade-head training will use few
> examples (link prediction still trains fully on the graph), or (b) pre-map FAERS
> names → RxCUI and rewrite the `drugs` field so values match `drug:{rxcui}` keys, or
> (c) rebuild the graph with name-keyed drug nodes. None of these mapping steps are
> implemented in the repo — they are manual.

---

## 7. Train

```bash
python training/train_cascade_gnn.py \
  --graph graph.pt \
  --cascades cascades.jsonl \
  --epochs 40 \
  --emb-dim 32 \
  --lr 0.01 \
  --neg-ratio 1 \
  --cascade-head deepsets \
  --out cascade_gnn.pt

# alternative cascade head:
python training/train_cascade_gnn.py --graph graph.pt --cascades cascades.jsonl \
  --cascade-head settransformer --out cascade_gnn.pt
```

**Exact flags:**

| Flag | Type | Default | Required | Notes |
|---|---|---|---|---|
| `--graph` | path | — | **yes** | `graph.pt` from §5 |
| `--cascades` | path | `None` | no | `cascades.jsonl` from §6 (optional) |
| `--epochs` | int | `40` | no | |
| `--emb-dim` | int | `32` | no | keep ≤ 64 on 24 GB |
| `--lr` | float | `0.01` | no | Adam |
| `--neg-ratio` | int | `1` | no | negative samples per positive edge |
| `--cascade-head` | choice | `deepsets` | no | `deepsets` or `settransformer` |
| `--out` | path | `cascade_gnn.pt` | no | |

**Loading + device:** graph is loaded with `torch.load(args.graph, weights_only=True)`.
Device is `cuda` if available, else `cpu` (prints a WARNING on CPU). Each cascade line
maps `obj.get('outcome','cascade')` and resolves each `d` in `obj.get('drugs',[])` via
`node_index.get(f'drug:{d}')` then `node_index.get(str(d))`; an example is kept only if
**≥ 2** ids resolve. If no mechanisms are parsed, `mechanisms` defaults to `['cascade']`.

**Training loop (per epoch):**

- `z = model.encode(edge_index, edge_type)`; `pos_logits = model.decoder(z[src], z[dst], edge_type)`.
- Negatives: `neg_dst = randint(0, num_nodes, (n_edges*neg_ratio,))`, `neg_src = src.repeat(neg_ratio)`, `neg_rel = edge_type.repeat(neg_ratio)`. `link_loss` = BCE-with-logits over `cat(pos, neg)` vs ones/zeros.
- Cascade head: iterates `cascade_examples[:512]` (minibatch cap 512); per example `risk_logit, mech_logits = model.score_cascade(z, idx)`; loss = `BCE(risk, 1.0) + cross_entropy(mech_logits, [mech])` plus a random negative drug set with target risk `0.0`; `cascade_loss = stack(losses).mean()`.
- `total = link_loss + cascade_loss`. Prints `epoch {e+1}/{epochs} link={..:.4f} cascade={..:.4f}` each epoch.

**Expected VRAM / time:** full-graph (not mini-batched) at `emb-dim 32` fits a 24 GB
RTX 3090/4090 for typical TWOSIDES-scale graphs; ~6–18 hours at 40 epochs depending on
relation count. If you OOM, lower `--emb-dim`, reduce `num_relations` by raising
`--min-prr` at graph-build time, or move to an A100 80 GB. See §10.

**The output checkpoint `cascade_gnn.pt`** (`torch.save(ckpt, args.out)`) contains
*exactly* these top-level keys — the loader depends on this structure:

```python
ckpt = {
    "state_dict": model.state_dict(),
    "config": {
        "num_nodes": num_nodes,
        "num_relations": num_relations,
        "num_mechanisms": len(mechanisms),
        "emb_dim": args.emb_dim,            # default 32
        "cascade_head": args.cascade_head,  # "deepsets" | "settransformer"
    },
    "edge_index": edge_index.cpu(),         # moved to CPU before saving
    "edge_type": edge_type.cpu(),           # moved to CPU before saving
    "node_index": node_index,               # dict[str,int]
    "relations": relations,                 # list[str]
    "mechanisms": mechanisms,               # list[str]
}
```

> The config does **not** persist `lr`, `neg_ratio`, or `epochs` — only architecture
> dims. `num_nodes` / `num_relations` / `num_mechanisms` must match `state_dict`
> shapes or `load_state_dict` (strict) fails at deploy. The checkpoint contains only
> tensors + plain dicts/lists/str/int/float — required because the loader uses
> `weights_only=True` (see §9/§10).

---

## 8. Calibration (Platt / temperature scaling)

**Not implemented.** Neither `train_cascade_gnn.py` nor `loader.py` performs any
post-hoc probability calibration (no Platt scaling, no temperature parameter, no
held-out calibration split). The model outputs raw logits → `sigmoid` at inference:

- Pairs: `loader._score_pairs` keeps a pair only if `best_prob >= 0.5`; severity
  thresholds are fixed (`>= 0.85` → contraindicated, `>= 0.65` → caution, else monitor);
  `confidence = round(best_prob, 3)`.
- Cascades: `loader._score_cascades` (needs `len(resolved) >= 3`) emits a cascade only
  if `sigmoid(risk_logit) >= 0.5`.

These are **uncalibrated** sigmoid probabilities. If you need calibrated confidences,
do it yourself: hold out a labelled validation set, fit temperature/Platt offline, and
**bake the adjustment into the logits before `sigmoid`** — but note the serving code
has no hook for a calibration parameter, so you would also need to modify
`loader.py`. There is no `--calibrate` flag or calibration field in the checkpoint.

---

## 9. Deploy the weights

The serving env var is **`CASCADE_GNN_WEIGHTS`** (`app/config.py:68`,
`os.getenv("CASCADE_GNN_WEIGHTS")`). It is read **once per process** via
`get_settings()` which is `lru_cache(maxsize=1)` — so you **must set it before the app
first imports settings, and you must restart the process to change it**.

```bash
# point at the trained checkpoint (absolute path is safest)
export CASCADE_GNN_WEIGHTS=/abs/path/to/cascade_gnn.pt

# restart the service so the lru_cache picks up the new value
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

For Docker, the lightweight image does **not** include torch/PyG. Build a derived
image that installs the §2.2 heavy deps, `COPY`/mount `cascade_gnn.pt`, and set
`CASCADE_GNN_WEIGHTS` (and `.env`). The loader needs **both** `torch` and
`torch_geometric` importable, or it reports the GNN unavailable.

### How the loader consumes the checkpoint

`loader.py` calls `torch.load(path, map_location="cpu", weights_only=True)`. It then
reads `config` (required — `num_nodes`, `num_relations`, `num_mechanisms`, optional
`emb_dim` default 32, optional `cascade_head` default `deepsets`), `state_dict`,
`edge_index`, `edge_type` (all required), and `node_index` / `relations` /
`mechanisms` (via `.get`, default empty). `cascade_head == 'settransformer'` selects
the Set-Transformer head; anything else selects Deep Sets.

> **Drug resolution at serving time.** The loader matches user drugs first by RxCUI
> string key, then by lowercased generic/name. So for `source: "model"` pairs to ever
> appear, `node_index` must contain keys that match real user drugs. Your graph keys
> are `drug:{rxcui}` — but the loader looks up the **bare** rxcui string and the bare
> lowercased name (not the `drug:` prefix). **If `node_index` only has `drug:{rxcui}`
> prefixed keys, no user drug will match and the GNN returns `available=True` with
> empty pairs/cascades** (`reason: 'no user drugs matched the trained graph'`). This
> is the most likely reason a correctly-trained checkpoint produces no model edges —
> verify the key convention before claiming the GNN is "live but silent."

### Verify GNN flips to live

```bash
# /health surfaces GNN availability (the route lives in app/main.py or app/routes/health.py,
# NOT in interactions.py). compute_report puts gnn.status() under report['gnn'].
curl -s localhost:8000/health | jq

# functional check — POST /interactions/check resolves rxcuis and runs compute_report
curl -s -X POST localhost:8000/interactions/check \
  -H 'Content-Type: application/json' \
  -d '{"rxcuis":["1191","29046"],"identity":"test"}' | jq
```

Note: `/interactions/check` **intentionally strips the `gnn` status field** from its
response — it returns only `pairs`, `cascades`, `hasMajor`, `modelVersion`,
`kbVersion`. Use `/health` to confirm GNN availability, and use the **`source` field
on each pair/cascade** to confirm model edges are flowing:

- `source: "kb"` → DDInter pair (confidence `null`), always present.
- `source: "mechanistic"` → overlay cascade (deterministic risk), always present.
- `source: "model"` → **GNN-predicted** pair/cascade (confidence = rounded sigmoid prob). **Seeing any `source: "model"` entry is your proof the trained weights are live.**

On a duplicate pair, **KB wins** — the model pair is dropped if the same (sorted,
lowercased) drug pair already came from KB. So model pairs surface for combinations KB
does not already cover.

`report['modelVersion']` comes from `Settings.model_version` (default
`cascade-gnn-0.0.0+kb-overlay`) — it does **not** automatically change when you load
weights; update `MODEL_VERSION` yourself if you want the version string to reflect a
trained model.

---

## 10. Validate + troubleshoot

**Smoke test before a multi-hour run.** Run 1–2 epochs on CPU or a tiny graph to
confirm the pipeline wires up:

```bash
python training/train_cascade_gnn.py --graph graph.pt --cascades cascades.jsonl --epochs 1 --out /tmp/smoke.pt
python -c "import torch; c=torch.load('/tmp/smoke.pt', weights_only=True); print(sorted(c.keys())); print(c['config'])"
```

| Symptom | Cause | Fix |
|---|---|---|
| `CUDA available: False` / training runs on CPU with a WARNING | torch wheel doesn't match driver, or pod launched without CUDA image | Reinstall the §2.2 wheels for the right CUDA; relaunch pod with a CUDA-tagged image; `nvidia-smi` to confirm driver. |
| `import torch_geometric` fails / `RGCNConv` missing | PyG or its C++ extensions not installed | Install `torch-geometric==2.6.1` **and** the `pyg_lib/torch_scatter/...` wheels from the `torch-2.5.0+cuXXX` index (§2.2). |
| **CUDA OOM** during training | full-graph R-GCN, too many relations, `emb-dim` too high | Lower `--emb-dim`; raise `--min-prr` at `build_graph.py` time to cut `num_relations`; use `RGCNConv` (already used) not `FastRGCNConv`; move to A100 80 GB. |
| `SystemExit: POSTGRES_URL required` (build_graph) | env var unset | `export POSTGRES_URL=...` before running. |
| ETL `SystemExit` on connect | `POSTGRES_URL` unset for ETL | same env var; `etl/common.py connect()` requires it. |
| `relation 'twosides_associations' does not exist` | ETL not run | Run §3.2 TWOSIDES ETL first; `psql` count-check. |
| `mined 0 cascade labels` | wrong FAERS files, thresholds too strict, or `--faers-dir` has no `DRUG/REAC/OUTC` `.txt` | Confirm the quarter ZIP was extracted and `_find()` can locate `DRUG*.txt` etc.; lower `--min-drugs` only down to its floor (still needs support `a>=3`, `prr>=2.0`). |
| Most cascade examples dropped at train time | **name↔RxCUI mismatch** (§0/§6) | Pre-map FAERS names → RxCUI to match `drug:{rxcui}` keys, or rebuild graph with name keys. Link prediction still trains regardless. |
| `weights_only` load error at deploy (`UnpicklingError` / disallowed global) | checkpoint contains a non-tensor / pickled object | The loader uses `weights_only=True` (deliberate, anti-RCE). Only re-save with tensors + plain dicts/lists/str/int/float — exactly what `train_cascade_gnn.py` writes. Do **not** stuff numpy/object arrays or custom classes into the checkpoint. |
| `load_state_dict` size mismatch at deploy | `config` dims (`num_nodes/num_relations/num_mechanisms`) don't match `state_dict` | Don't hand-edit `config`; deploy the checkpoint exactly as `train_cascade_gnn.py` wrote it. Retrain if the graph changed. |
| `/health` shows GNN unavailable, reason `CASCADE_GNN_WEIGHTS not configured` | env var unset, or set after process start | Export the var **before** boot and **restart** (lru_cache reads it once). |
| `/health` shows GNN unavailable, reason `torch/torch_geometric not installed` | heavy deps missing in the serving env/image | Install §2.2 deps in the serving environment (derived Docker image). |
| GNN available but **no `source: "model"` pairs ever** | `node_index` keys don't match user drugs (prefixed `drug:` vs bare rxcui/name) | Verify the key convention against `loader.py` resolution (bare rxcui string, then lowercased name). Likely needs a graph-build change to emit matchable keys. |

**Graceful-degradation guarantee:** if anything above fails, the service still returns
KB pairs + mechanistic overlay cascades. A broken or missing GNN never takes the
service down and never fabricates probabilities.
