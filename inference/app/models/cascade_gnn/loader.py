"""Cascade GNN serving loader (PRD §10.2 serving).

Loads trained weights and exposes inference. If torch/PyG or the weights are
absent, `available` is False and the engine falls back to KB pairs + the
deterministic mechanistic overlay, labeling GNN predictions as unavailable —
NEVER inventing probabilities (PRD §10.2).

Weights are produced by `training/train_cascade_gnn.py` and saved as a torch
checkpoint containing: model state_dict, graph edge_index/edge_type tensors, the
drug-node index map (rxcui/name -> node id), the relation map, and the mechanism
class list. The path is configured via CASCADE_GNN_WEIGHTS.
"""

from __future__ import annotations

from typing import Any

from app.config import get_settings
from app.models.cascade_gnn.model import build_rgcn_modules, torch_available


class CascadeGNNServer:
    def __init__(self) -> None:
        self.settings = get_settings()
        self._loaded = False
        self._load_error: str | None = None
        self._model = None
        self._ckpt: dict[str, Any] | None = None

    @property
    def model_version(self) -> str:
        return self.settings.model_version

    def status(self) -> dict[str, Any]:
        ok, err = torch_available()
        if not ok:
            return {"available": False, "reason": f"torch/torch_geometric not installed: {err}"}
        if not self.settings.cascade_gnn_weights:
            return {"available": False, "reason": "CASCADE_GNN_WEIGHTS not configured (no trained weights)"}
        if self._load_error:
            return {"available": False, "reason": self._load_error}
        return {"available": self._loaded, "reason": None if self._loaded else "not yet loaded"}

    def is_available(self) -> bool:
        return self.status()["available"]

    def _ensure_loaded(self) -> bool:
        if self._loaded:
            return True
        ok, err = torch_available()
        if not ok:
            self._load_error = f"torch/torch_geometric not installed: {err}"
            return False
        if not self.settings.cascade_gnn_weights:
            self._load_error = "CASCADE_GNN_WEIGHTS not configured"
            return False
        try:
            import torch

            # Checkpoint holds only tensors + plain dicts/lists, so load with
            # weights_only=True to avoid unpickling arbitrary objects (RCE risk).
            ckpt = torch.load(
                self.settings.cascade_gnn_weights, map_location="cpu", weights_only=True
            )
            modules = build_rgcn_modules()
            cfg = ckpt["config"]
            model = modules["CascadeGNN"](
                num_nodes=cfg["num_nodes"],
                num_relations=cfg["num_relations"],
                num_mechanisms=cfg["num_mechanisms"],
                emb_dim=cfg.get("emb_dim", 32),
                cascade_head=cfg.get("cascade_head", "deepsets"),
            )
            model.load_state_dict(ckpt["state_dict"])
            model.eval()
            self._model = model
            self._ckpt = ckpt
            self._loaded = True
            return True
        except Exception as exc:
            self._load_error = f"failed to load cascade GNN weights: {exc}"
            return False

    def predict(self, drugs: list[dict[str, Any]]) -> dict[str, Any]:
        """Predict model-sourced pairwise edges + cascades for a drug set.

        Returns {"available": bool, "pairs": [...], "cascades": [...], "reason"}.
        When unavailable, pairs/cascades are empty and reason explains why. The
        CascadeMap engine merges these with KB + overlay results.
        """
        if not self._ensure_loaded():
            return {
                "available": False,
                "pairs": [],
                "cascades": [],
                "reason": self._load_error or "cascade GNN unavailable",
            }
        try:
            import torch

            ckpt = self._ckpt or {}
            node_index: dict[str, int] = ckpt.get("node_index", {})
            relations: list[str] = ckpt.get("relations", [])
            mechanisms: list[str] = ckpt.get("mechanisms", [])
            edge_index = ckpt["edge_index"]
            edge_type = ckpt["edge_type"]

            # Map this user's drugs to graph node ids (by rxcui then name key).
            resolved: list[tuple[str, int]] = []
            for d in drugs:
                key = str(d.get("rxcui") or "").strip()
                label = d.get("label") or d.get("name") or d.get("generic_name") or ""
                node = node_index.get(key)
                if node is None:
                    node = node_index.get((d.get("generic_name") or label or "").lower())
                if node is not None:
                    resolved.append((label, int(node)))

            if len(resolved) < 1:
                return {
                    "available": True,
                    "pairs": [],
                    "cascades": [],
                    "reason": "no user drugs matched the trained graph",
                }

            with torch.no_grad():
                z = self._model.encode(edge_index, edge_type)
                pairs = self._score_pairs(z, resolved, relations)
                cascades = self._score_cascades(z, resolved, mechanisms)
            return {"available": True, "pairs": pairs, "cascades": cascades, "reason": None}
        except Exception as exc:
            return {
                "available": False,
                "pairs": [],
                "cascades": [],
                "reason": f"cascade GNN inference error: {exc}",
            }

    def _score_pairs(self, z, resolved, relations) -> list[dict[str, Any]]:
        import torch
        from itertools import combinations

        out: list[dict[str, Any]] = []
        for (label_a, ni), (label_b, nj) in combinations(resolved, 2):
            best_rel, best_prob = None, 0.0
            for r_idx, r_name in enumerate(relations):
                logit = self._model.decode_pair(
                    z, torch.tensor(ni), torch.tensor(nj), torch.tensor(r_idx)
                )
                prob = float(torch.sigmoid(logit))
                if prob > best_prob:
                    best_prob, best_rel = prob, r_name
            if best_prob >= 0.5 and best_rel:
                out.append(
                    {
                        "drugA": label_a,
                        "drugB": label_b,
                        "severity": _prob_to_severity(best_prob),
                        "mechanism": best_rel,
                        "management": "Discuss with prescriber; model-predicted association.",
                        "source": "model",
                        "confidence": round(best_prob, 3),
                    }
                )
        return out

    def _score_cascades(self, z, resolved, mechanisms) -> list[dict[str, Any]]:
        import torch

        if len(resolved) < 3:
            return []
        indices = torch.tensor([n for _, n in resolved])
        risk_logit, mech_logits = self._model.score_cascade(z, indices)
        risk = float(torch.sigmoid(risk_logit).squeeze())
        if risk < 0.5:
            return []
        mech_name = "model-predicted cascade"
        if mechanisms:
            mech_idx = int(torch.argmax(mech_logits))
            if 0 <= mech_idx < len(mechanisms):
                mech_name = mechanisms[mech_idx]
        return [
            {
                "drugs": [label for label, _ in resolved],
                "risk": round(risk, 3),
                "dominantMechanism": mech_name,
                "explanation": "Set-aggregation model flags an elevated multi-drug cascade risk.",
                "source": "model",
            }
        ]


def _prob_to_severity(prob: float) -> str:
    if prob >= 0.85:
        return "contraindicated"
    if prob >= 0.65:
        return "caution"
    return "monitor"


_instance: CascadeGNNServer | None = None


def get_cascade_server() -> CascadeGNNServer:
    global _instance
    if _instance is None:
        _instance = CascadeGNNServer()
    return _instance
