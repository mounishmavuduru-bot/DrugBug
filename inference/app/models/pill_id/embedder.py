"""DrugScan layer 3: visual embedding + nearest-neighbor match (PRD §10.1).

An ArcFace / bilinear-CNN metric-learning network produces an embedding matched
(nearest-neighbor) against the ePillID / NLM C3PI RxImage reference gallery
stored in Postgres (`pill_reference.embedding`).

torch is a heavy dep imported lazily and guarded. numpy is a lightweight boot
dep used for the cosine-similarity NN search over gallery embeddings. Absent
model weights → the layer reports "unavailable" and contributes no signal.
"""

from __future__ import annotations

import json
from typing import Any

import numpy as np

from app.config import get_settings


class PillEmbedder:
    def __init__(self) -> None:
        self.settings = get_settings()
        self._model = None
        self._error: str | None = None

    def status(self) -> dict[str, Any]:
        if not self.settings.pill_embedder_weights:
            return {"available": False, "reason": "PILL_EMBEDDER_WEIGHTS not configured"}
        try:
            import torch  # noqa: F401
        except Exception as exc:
            return {"available": False, "reason": f"torch not installed: {exc}"}
        if self._error:
            return {"available": False, "reason": self._error}
        return {"available": True, "reason": None}

    def _ensure_loaded(self) -> bool:
        if self._model is not None:
            return True
        if not self.settings.pill_embedder_weights:
            self._error = "PILL_EMBEDDER_WEIGHTS not configured"
            return False
        try:
            import torch

            # TorchScript / state_dict for the metric-learning backbone produced
            # by training/train_pill_embedder.py. Loaded weights-only-safe via
            # torch.jit when scripted, else a plain checkpoint.
            try:
                self._model = torch.jit.load(self.settings.pill_embedder_weights, map_location="cpu")
            except Exception:
                from app.models.pill_id.embedder_net import build_embedder

                ckpt = torch.load(
                    self.settings.pill_embedder_weights, map_location="cpu", weights_only=True
                )
                model = build_embedder(emb_dim=ckpt.get("emb_dim", 512))
                model.load_state_dict(ckpt["state_dict"])
                self._model = model
            self._model.eval()
            return True
        except Exception as exc:
            self._error = f"embedder load failed: {exc}"
            return False

    def embed(self, crop_bytes: bytes) -> dict[str, Any]:
        if not self._ensure_loaded():
            return {"available": False, "embedding": None, "reason": self._error}
        try:
            from io import BytesIO

            import torch
            from PIL import Image

            img = Image.open(BytesIO(crop_bytes)).convert("RGB").resize((224, 224))
            arr = np.asarray(img, dtype=np.float32) / 255.0
            arr = (arr - 0.5) / 0.5
            tensor = torch.from_numpy(arr.transpose(2, 0, 1)).unsqueeze(0)
            with torch.no_grad():
                emb = self._model(tensor).squeeze(0).cpu().numpy()
            norm = np.linalg.norm(emb)
            if norm > 0:
                emb = emb / norm
            return {"available": True, "embedding": emb.tolist(), "reason": None}
        except Exception as exc:
            return {"available": False, "embedding": None, "reason": f"embedding failed: {exc}"}

    def nearest_neighbors(
        self, query_embedding: list[float], gallery: list[dict[str, Any]], top_k: int = 5
    ) -> list[dict[str, Any]]:
        """Cosine-similarity NN search over gallery rows (each with `embedding`).

        Gallery embeddings may be stored as JSON strings or lists. Returns the
        top_k candidates with a `similarity` in [0, 1].
        """
        if not query_embedding or not gallery:
            return []
        q = np.asarray(query_embedding, dtype=np.float32)
        qn = np.linalg.norm(q)
        if qn == 0:
            return []
        q = q / qn

        scored: list[tuple[float, dict[str, Any]]] = []
        for row in gallery:
            emb = row.get("embedding")
            if isinstance(emb, str):
                try:
                    emb = json.loads(emb)
                except json.JSONDecodeError:
                    continue
            if not emb:
                continue
            v = np.asarray(emb, dtype=np.float32)
            vn = np.linalg.norm(v)
            if vn == 0 or v.shape != q.shape:
                continue
            sim = float(np.dot(q, v / vn))
            scored.append(((sim + 1.0) / 2.0, row))  # map [-1,1] -> [0,1]
        scored.sort(key=lambda x: x[0], reverse=True)
        out = []
        for sim, row in scored[:top_k]:
            out.append({**{k: row.get(k) for k in ("ndc", "name", "generic_name", "imprint", "shape", "color")}, "similarity": round(sim, 4)})
        return out
