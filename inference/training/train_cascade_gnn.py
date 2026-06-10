"""Train the Cascade GNN (PRD §10.2/§11) — GPU REQUIRED.

Real, runnable training of the Decagon-style R-GCN encoder + DEDICOM decoder
(pairwise side-effect link prediction) + Deep Sets / Set-Transformer cascade head
(multi-drug cascade risk + dominant mechanism), using:
  - the graph artifact from build_graph.py (edge_index/edge_type/node_index/relations)
  - the FAERS cascade labels from mine_faers_cascades.py

This requires a CUDA GPU (PRD §11). It is NOT fake-trained — it runs real
optimization and saves a checkpoint that app/models/cascade_gnn/loader.py loads.

Usage (on a GPU box):
    python training/train_cascade_gnn.py --graph graph.pt --cascades cascades.jsonl \
        --epochs 40 --cascade-head deepsets --out cascade_gnn.pt

A Claude subscription does not provide training compute (PRD §11/§21).
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any


def main() -> int:
    ap = argparse.ArgumentParser(description="Train the Cascade GNN (GPU required)")
    ap.add_argument("--graph", required=True)
    ap.add_argument("--cascades", default=None, help="FAERS cascade labels JSONL")
    ap.add_argument("--epochs", type=int, default=40)
    ap.add_argument("--emb-dim", type=int, default=32)
    ap.add_argument("--lr", type=float, default=0.01)
    ap.add_argument("--neg-ratio", type=int, default=1)
    ap.add_argument("--cascade-head", choices=["deepsets", "settransformer"], default="deepsets")
    ap.add_argument("--out", default="cascade_gnn.pt")
    args = ap.parse_args()

    import torch
    import torch.nn.functional as F

    from app.models.cascade_gnn.model import build_rgcn_modules

    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cpu":
        print("WARNING: no CUDA GPU detected — training will be very slow (PRD §11).")

    # graph.pt holds only tensors + plain dicts/lists (built by build_graph.py),
    # so load weights_only-safe even though it is a locally-produced artifact.
    graph = torch.load(args.graph, weights_only=True)
    edge_index = graph["edge_index"].to(device)
    edge_type = graph["edge_type"].to(device)
    num_nodes = int(graph["num_nodes"])
    num_relations = int(graph["num_relations"])
    node_index: dict[str, int] = graph["node_index"]
    relations: list[str] = graph["relations"]

    # --- cascade labels -> mechanism classes + supervised sets ---
    cascade_examples: list[tuple[list[int], int]] = []
    mechanisms: list[str] = []
    mech_idx: dict[str, int] = {}
    if args.cascades:
        with open(args.cascades) as f:
            for line in f:
                obj = json.loads(line)
                outcome = obj.get("outcome", "cascade")
                if outcome not in mech_idx:
                    mech_idx[outcome] = len(mechanisms)
                    mechanisms.append(outcome)
                ids = []
                for d in obj.get("drugs", []):
                    nid = node_index.get(f"drug:{d}") or node_index.get((str(d)))
                    if nid is not None:
                        ids.append(int(nid))
                if len(ids) >= 2:
                    cascade_examples.append((ids, mech_idx[outcome]))
    if not mechanisms:
        mechanisms = ["cascade"]

    modules = build_rgcn_modules()
    model = modules["CascadeGNN"](
        num_nodes=num_nodes,
        num_relations=num_relations,
        num_mechanisms=len(mechanisms),
        emb_dim=args.emb_dim,
        cascade_head=args.cascade_head,
    ).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=args.lr)

    src, dst = edge_index[0], edge_index[1]
    n_edges = src.size(0)

    for epoch in range(args.epochs):
        model.train()
        opt.zero_grad()
        z = model.encode(edge_index, edge_type)

        # --- pairwise link-prediction loss (positive edges + negative sampling) ---
        pos_logits = model.decoder(z[src], z[dst], edge_type)
        neg_dst = torch.randint(0, num_nodes, (n_edges * args.neg_ratio,), device=device)
        neg_src = src.repeat(args.neg_ratio)
        neg_rel = edge_type.repeat(args.neg_ratio)
        neg_logits = model.decoder(z[neg_src], z[neg_dst], neg_rel)
        link_loss = F.binary_cross_entropy_with_logits(
            torch.cat([pos_logits, neg_logits]),
            torch.cat([torch.ones_like(pos_logits), torch.zeros_like(neg_logits)]),
        )

        # --- cascade head loss (risk = 1 for mined cascades + negatives) ---
        cascade_loss = torch.tensor(0.0, device=device)
        if cascade_examples:
            losses = []
            for ids, mech in cascade_examples[:512]:  # minibatch over examples
                idx = torch.tensor(ids, device=device)
                risk_logit, mech_logits = model.score_cascade(z, idx)
                losses.append(
                    F.binary_cross_entropy_with_logits(
                        risk_logit.squeeze(), torch.tensor(1.0, device=device)
                    )
                    + F.cross_entropy(
                        mech_logits.unsqueeze(0), torch.tensor([mech], device=device)
                    )
                )
                # negative: random drug set
                rand_ids = torch.randint(0, num_nodes, (len(ids),), device=device)
                neg_risk, _ = model.score_cascade(z, rand_ids)
                losses.append(
                    F.binary_cross_entropy_with_logits(
                        neg_risk.squeeze(), torch.tensor(0.0, device=device)
                    )
                )
            cascade_loss = torch.stack(losses).mean()

        loss = link_loss + cascade_loss
        loss.backward()
        opt.step()
        print(f"epoch {epoch+1}/{args.epochs} link={link_loss.item():.4f} cascade={float(cascade_loss):.4f}")

    # --- save checkpoint for serving (loader expects this exact structure) ---
    ckpt = {
        "state_dict": model.state_dict(),
        "config": {
            "num_nodes": num_nodes,
            "num_relations": num_relations,
            "num_mechanisms": len(mechanisms),
            "emb_dim": args.emb_dim,
            "cascade_head": args.cascade_head,
        },
        "edge_index": edge_index.cpu(),
        "edge_type": edge_type.cpu(),
        "node_index": node_index,
        "relations": relations,
        "mechanisms": mechanisms,
    }
    torch.save(ckpt, args.out)
    print(f"saved cascade GNN -> {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
