"""Cascade GNN model definition (PRD §10.2, §11) — Decagon-style.

Architecture:
  - Encoder: relational GCN (R-GCN) over a heterogeneous graph
      nodes  = drugs + proteins
      edges  = drug-drug polypharmacy side-effects (one relation per side-effect),
               drug-protein targets, protein-protein interactions
  - Decoder: tensor-factorization / DEDICOM decoder predicting the probability of
      each side-effect edge type between a drug pair.
  - Cascade head: Deep Sets / Set-Transformer aggregating the set of drug
      embeddings in a combination to predict aggregate cascade risk + dominant
      mechanism.

torch / torch_geometric are HEAVY deps imported lazily here; the module file
itself imports nothing heavy at top level so the app boots without them. The
serving loader (`loader.py`) guards the import and reports "unavailable" when
the libraries or weights are absent — it never invents probabilities.

This is a real model definition usable by `training/train_cascade_gnn.py` on GPU.
"""

from __future__ import annotations

from typing import Any


def build_rgcn_modules():
    """Lazily import torch/PyG and return the model classes.

    Returns a dict of class objects so callers can instantiate without importing
    torch at module import time. Raises ImportError (caught by the loader) if the
    heavy deps are not installed.
    """
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    from torch_geometric.nn import RGCNConv

    class RGCNEncoder(nn.Module):
        """Two-layer R-GCN encoder producing node embeddings."""

        def __init__(self, num_nodes: int, num_relations: int, hidden: int = 64, out: int = 32):
            super().__init__()
            self.node_emb = nn.Embedding(num_nodes, hidden)
            self.conv1 = RGCNConv(hidden, hidden, num_relations, num_bases=min(30, num_relations))
            self.conv2 = RGCNConv(hidden, out, num_relations, num_bases=min(30, num_relations))

        def forward(self, edge_index, edge_type):
            x = self.node_emb.weight
            x = F.relu(self.conv1(x, edge_index, edge_type))
            x = self.conv2(x, edge_index, edge_type)
            return x

    class DEDICOMDecoder(nn.Module):
        """DEDICOM tensor-factorization decoder (Decagon-style).

        score(i, r, j) = z_i^T D_r R D_r z_j, with a shared global matrix R and a
        per-relation diagonal D_r. Predicts the probability of side-effect edge
        type r between drug pair (i, j).
        """

        def __init__(self, dim: int, num_relations: int):
            super().__init__()
            self.global_interaction = nn.Parameter(torch.randn(dim, dim) * 0.01)
            self.relation_diag = nn.Parameter(torch.randn(num_relations, dim) * 0.01)

        def forward(self, z_i, z_j, rel_idx):
            d = self.relation_diag[rel_idx]
            left = z_i * d
            right = z_j * d
            scores = (left @ self.global_interaction * right).sum(dim=-1)
            return scores  # logits

    class DeepSetsCascadeHead(nn.Module):
        """Permutation-invariant cascade head (Deep Sets).

        Consumes the set of drug embeddings for a combination, produces an
        aggregate cascade-risk logit plus a dominant-mechanism class logit vector.
        """

        def __init__(self, dim: int, num_mechanisms: int, hidden: int = 64):
            super().__init__()
            self.phi = nn.Sequential(
                nn.Linear(dim, hidden), nn.ReLU(), nn.Linear(hidden, hidden), nn.ReLU()
            )
            self.rho_risk = nn.Sequential(
                nn.Linear(hidden, hidden), nn.ReLU(), nn.Linear(hidden, 1)
            )
            self.rho_mech = nn.Sequential(
                nn.Linear(hidden, hidden), nn.ReLU(), nn.Linear(hidden, num_mechanisms)
            )

        def forward(self, drug_embeddings):
            # drug_embeddings: [set_size, dim]
            h = self.phi(drug_embeddings)
            pooled = h.sum(dim=0)  # permutation-invariant aggregation
            risk_logit = self.rho_risk(pooled)
            mech_logits = self.rho_mech(pooled)
            return risk_logit, mech_logits

    class SetTransformerCascadeHead(nn.Module):
        """Set-Transformer cascade head (attention-based set aggregation).

        Alternative to Deep Sets; uses a single induced-set attention block + a
        pooling-by-multihead-attention seed for the aggregate prediction.
        """

        def __init__(self, dim: int, num_mechanisms: int, heads: int = 4, hidden: int = 64):
            super().__init__()
            self.proj = nn.Linear(dim, hidden)
            self.attn = nn.MultiheadAttention(hidden, heads, batch_first=True)
            self.seed = nn.Parameter(torch.randn(1, 1, hidden) * 0.02)
            self.risk = nn.Linear(hidden, 1)
            self.mech = nn.Linear(hidden, num_mechanisms)

        def forward(self, drug_embeddings):
            # drug_embeddings: [set_size, dim] -> [1, set_size, hidden]
            x = self.proj(drug_embeddings).unsqueeze(0)
            seed = self.seed.expand(1, 1, x.size(-1))
            pooled, _ = self.attn(seed, x, x)
            pooled = pooled.squeeze(0).squeeze(0)
            return self.risk(pooled), self.mech(pooled)

    class CascadeGNN(nn.Module):
        """Full model: encoder + DEDICOM pairwise decoder + cascade head."""

        def __init__(
            self,
            num_nodes: int,
            num_relations: int,
            num_mechanisms: int,
            emb_dim: int = 32,
            cascade_head: str = "deepsets",
        ):
            super().__init__()
            self.encoder = RGCNEncoder(num_nodes, num_relations, out=emb_dim)
            self.decoder = DEDICOMDecoder(emb_dim, num_relations)
            if cascade_head == "settransformer":
                self.cascade = SetTransformerCascadeHead(emb_dim, num_mechanisms)
            else:
                self.cascade = DeepSetsCascadeHead(emb_dim, num_mechanisms)

        def encode(self, edge_index, edge_type):
            return self.encoder(edge_index, edge_type)

        def decode_pair(self, z, i, j, rel_idx):
            return self.decoder(z[i], z[j], rel_idx)

        def score_cascade(self, z, drug_indices):
            return self.cascade(z[drug_indices])

    return {
        "RGCNEncoder": RGCNEncoder,
        "DEDICOMDecoder": DEDICOMDecoder,
        "DeepSetsCascadeHead": DeepSetsCascadeHead,
        "SetTransformerCascadeHead": SetTransformerCascadeHead,
        "CascadeGNN": CascadeGNN,
    }


def torch_available() -> tuple[bool, str | None]:
    try:
        import torch  # noqa: F401
        import torch_geometric  # noqa: F401
    except Exception as exc:
        return False, str(exc)
    return True, None
