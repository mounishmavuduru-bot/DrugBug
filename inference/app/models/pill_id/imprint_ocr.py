"""DrugScan layer 2: imprint OCR (PRD §10.1) — primary discriminative signal.

TrOCR (fine-tuned) or a CRNN reads the imprint code. The FDA requires a unique
imprint on every U.S. oral Rx solid; the imprint is the closest thing to a
deterministic key, so this is the strongest single signal in fusion.

transformers/TrOCR + torch are heavy deps imported lazily and guarded. Absent →
the layer returns an explicit "unavailable" state and contributes no signal —
never a fabricated imprint.
"""

from __future__ import annotations

import re
from typing import Any

from app.config import get_settings


def normalize_imprint(text: str) -> str:
    """Uppercase and strip to alphanumerics + a few imprint delimiters."""
    text = (text or "").upper()
    text = re.sub(r"[^A-Z0-9;\- ]", "", text)
    return re.sub(r"\s+", " ", text).strip()


class ImprintOCR:
    def __init__(self) -> None:
        self.settings = get_settings()
        self._processor = None
        self._model = None
        self._error: str | None = None

    def status(self) -> dict[str, Any]:
        if not self.settings.imprint_ocr_weights:
            return {"available": False, "reason": "IMPRINT_OCR_WEIGHTS not configured"}
        try:
            import torch  # noqa: F401
            import transformers  # noqa: F401
        except Exception as exc:
            return {"available": False, "reason": f"transformers/torch not installed: {exc}"}
        if self._error:
            return {"available": False, "reason": self._error}
        return {"available": True, "reason": None}

    def _ensure_loaded(self) -> bool:
        if self._model is not None:
            return True
        if not self.settings.imprint_ocr_weights:
            self._error = "IMPRINT_OCR_WEIGHTS not configured"
            return False
        try:
            from transformers import TrOCRProcessor, VisionEncoderDecoderModel

            self._processor = TrOCRProcessor.from_pretrained(self.settings.imprint_ocr_weights)
            self._model = VisionEncoderDecoderModel.from_pretrained(self.settings.imprint_ocr_weights)
            self._model.eval()
            return True
        except Exception as exc:
            self._error = f"imprint OCR load failed: {exc}"
            return False

    def read(self, crop_bytes: bytes) -> dict[str, Any]:
        """Read the imprint from a pill crop.

        Returns {"available": bool, "imprint": str|None, "raw": str|None,
                 "reason": str|None}.
        """
        if not self._ensure_loaded():
            return {"available": False, "imprint": None, "raw": None, "reason": self._error}
        try:
            from io import BytesIO

            import torch
            from PIL import Image

            img = Image.open(BytesIO(crop_bytes)).convert("RGB")
            pixel_values = self._processor(images=img, return_tensors="pt").pixel_values
            with torch.no_grad():
                ids = self._model.generate(pixel_values, max_new_tokens=24)
            raw = self._processor.batch_decode(ids, skip_special_tokens=True)[0]
            return {"available": True, "imprint": normalize_imprint(raw), "raw": raw, "reason": None}
        except Exception as exc:
            return {"available": False, "imprint": None, "raw": None, "reason": f"imprint OCR failed: {exc}"}
