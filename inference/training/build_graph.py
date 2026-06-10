"""Build the heterogeneous graph for the Cascade GNN (PRD §10.2/§11).

Ingests TWOSIDES (drug-drug-SE), STITCH/DrugBank targets (drug-protein), and a
human PPI network (STRING/BioSNAP) into a single PyG-style graph and writes a
graph artifact consumed by train_cascade_gnn.py.

Real, runnable. torch / torch_geometric are GPU/heavy deps imported lazily; the
graph assembly itself uses numpy + Postgres. Drug-drug-SE edges are read from the
`twosides_associations` table populated by etl/ingest_twosides.py; drug-protein
and protein-protein edges are read from provided TSVs (STITCH/STRING formats).

Output: a .pt file with edge_index, edge_type, node_index, relations, and the
node-type map, plus a JSON sidecar of metadata.

Usage:
    python training/build_graph.py \
        --drug-target STITCH_drug_protein.tsv \
        --ppi STRING_protein_links.tsv \
        --out graph.pt
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict
from typing import Any

import psycopg


def _pg_url() -> str:
    url = os.getenv("POSTGRES_URL")
    if not url:
        raise SystemExit("POSTGRES_URL required")
    return url


def load_twosides(min_prr: float = 2.0, limit: int | None = None) -> list[tuple[str, str, str]]:
    """Load (drug_a, drug_b, side_effect) edges above a PRR threshold."""
    edges: list[tuple[str, str, str]] = []
    with psycopg.connect(_pg_url()) as conn, conn.cursor() as cur:
        sql = (
            "SELECT drug_a_rxcui, drug_b_rxcui, side_effect FROM twosides_associations "
            "WHERE prr IS NULL OR prr >= %s"
        )
        if limit:
            sql += f" LIMIT {int(limit)}"
        cur.execute(sql, (min_prr,))
        for a, b, se in cur.fetchall():
            edges.append((str(a), str(b), str(se)))
    return edges


def load_tsv_edges(path: str | None, a_col: int = 0, b_col: int = 1, sep: str = "\t") -> list[tuple[str, str]]:
    if not path or not os.path.exists(path):
        return []
    out: list[tuple[str, str]] = []
    with open(path, encoding="utf-8") as f:
        header_skipped = False
        for line in f:
            parts = line.rstrip("\n").split(sep)
            if len(parts) <= max(a_col, b_col):
                continue
            if not header_skipped:
                header_skipped = True
                # Skip header if non-numeric / contains letters in id columns
                continue
            out.append((parts[a_col], parts[b_col]))
    return out


def build(drug_target_path: str | None, ppi_path: str | None, min_prr: float) -> dict[str, Any]:
    se_edges = load_twosides(min_prr=min_prr)
    dt_edges = load_tsv_edges(drug_target_path)
    pp_edges = load_tsv_edges(ppi_path)

    node_index: dict[str, int] = {}
    node_type: dict[str, str] = {}

    def node_id(key: str, ntype: str) -> int:
        if key not in node_index:
            node_index[key] = len(node_index)
            node_type[key] = ntype
        return node_index[key]

    # Relations: one per side-effect, plus drug-target and protein-protein.
    relation_index: dict[str, int] = {}

    def rel_id(name: str) -> int:
        if name not in relation_index:
            relation_index[name] = len(relation_index)
        return relation_index[name]

    edge_src: list[int] = []
    edge_dst: list[int] = []
    edge_rel: list[int] = []

    for a, b, se in se_edges:
        ai = node_id(f"drug:{a}", "drug")
        bi = node_id(f"drug:{b}", "drug")
        r = rel_id(f"se:{se}")
        edge_src += [ai, bi]
        edge_dst += [bi, ai]
        edge_rel += [r, r]

    dt_rel = rel_id("drug_target")
    for d, p in dt_edges:
        di = node_id(f"drug:{d}", "drug")
        pi = node_id(f"protein:{p}", "protein")
        edge_src += [di, pi]
        edge_dst += [pi, di]
        edge_rel += [dt_rel, dt_rel]

    pp_rel = rel_id("ppi")
    for p1, p2 in pp_edges:
        pi1 = node_id(f"protein:{p1}", "protein")
        pi2 = node_id(f"protein:{p2}", "protein")
        edge_src += [pi1, pi2]
        edge_dst += [pi2, pi1]
        edge_rel += [pp_rel, pp_rel]

    relations = [None] * len(relation_index)
    for name, idx in relation_index.items():
        relations[idx] = name

    return {
        "node_index": node_index,
        "node_type": node_type,
        "relations": relations,
        "edge_src": edge_src,
        "edge_dst": edge_dst,
        "edge_rel": edge_rel,
        "num_nodes": len(node_index),
        "num_relations": len(relation_index),
    }


def save(graph: dict[str, Any], out_path: str) -> None:
    import torch

    edge_index = torch.tensor([graph["edge_src"], graph["edge_dst"]], dtype=torch.long)
    edge_type = torch.tensor(graph["edge_rel"], dtype=torch.long)
    torch.save(
        {
            "edge_index": edge_index,
            "edge_type": edge_type,
            "node_index": graph["node_index"],
            "node_type": graph["node_type"],
            "relations": graph["relations"],
            "num_nodes": graph["num_nodes"],
            "num_relations": graph["num_relations"],
        },
        out_path,
    )
    with open(out_path + ".meta.json", "w") as f:
        json.dump(
            {
                "num_nodes": graph["num_nodes"],
                "num_relations": graph["num_relations"],
                "num_edges": len(graph["edge_src"]),
            },
            f,
            indent=2,
        )


def main() -> int:
    ap = argparse.ArgumentParser(description="Build cascade GNN graph")
    ap.add_argument("--drug-target", default=None, help="STITCH/DrugBank drug-protein TSV")
    ap.add_argument("--ppi", default=None, help="STRING/BioSNAP protein-protein TSV")
    ap.add_argument("--min-prr", type=float, default=2.0)
    ap.add_argument("--out", default="graph.pt")
    args = ap.parse_args()

    graph = build(args.drug_target, args.ppi, args.min_prr)
    print(
        f"graph: {graph['num_nodes']} nodes, {graph['num_relations']} relations, "
        f"{len(graph['edge_src'])} directed edges"
    )
    save(graph, args.out)
    print(f"saved -> {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
