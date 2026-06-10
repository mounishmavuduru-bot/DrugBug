"""DrugScan layer 1: detection / segmentation (PRD §10.1).

YOLO / Detectron2 isolates the pill(s) from background and normalizes scale.
Heavy deps (detectron2/ultralytics + torch) are imported lazily and guarded. If
weights are absent, we degrade to whole-image processing and note it in the
per-layer breakdown — never a fake bounding box.
"""

from __future__ import annotations

from typing import Any

from app.config import get_settings


class PillDetector:
    def __init__(self) -> None:
        self.settings = get_settings()
        self._model = None
        self._error: str | None = None

    def status(self) -> dict[str, Any]:
        if not self.settings.pill_detector_weights:
            return {"available": False, "reason": "PILL_DETECTOR_WEIGHTS not configured"}
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
        if not self.settings.pill_detector_weights:
            self._error = "PILL_DETECTOR_WEIGHTS not configured"
            return False
        try:
            # ultralytics YOLO is the lighter of the two supported backends.
            from ultralytics import YOLO

            self._model = YOLO(self.settings.pill_detector_weights)
            return True
        except Exception as exc:
            self._error = f"detector load failed: {exc}"
            return False

    def detect(self, image_bytes: bytes) -> dict[str, Any]:
        """Return detected pill crops + scale info.

        Result:
          {"available": bool, "degraded": bool, "regions": [{bbox, crop_bytes}],
           "reason": str|None}
        Degraded mode returns the whole image as a single region.
        """
        from io import BytesIO

        from PIL import Image  # pillow is a lightweight boot dep

        try:
            img = Image.open(BytesIO(image_bytes)).convert("RGB")
        except Exception as exc:
            return {"available": False, "degraded": True, "regions": [], "reason": f"unreadable image: {exc}"}

        if not self._ensure_loaded():
            # Honest degradation: whole-image region.
            buf = BytesIO()
            img.save(buf, format="JPEG")
            return {
                "available": False,
                "degraded": True,
                "regions": [{"bbox": [0, 0, img.width, img.height], "crop_bytes": buf.getvalue()}],
                "reason": self._error or "detector weights absent — using whole image",
            }

        try:
            results = self._model(img)
            regions: list[dict[str, Any]] = []
            for res in results:
                boxes = getattr(res, "boxes", None)
                if boxes is None:
                    continue
                for box in boxes.xyxy.tolist():
                    x1, y1, x2, y2 = (int(v) for v in box[:4])
                    crop = img.crop((x1, y1, x2, y2))
                    buf = BytesIO()
                    crop.save(buf, format="JPEG")
                    regions.append({"bbox": [x1, y1, x2, y2], "crop_bytes": buf.getvalue()})
            if not regions:
                buf = BytesIO()
                img.save(buf, format="JPEG")
                regions = [{"bbox": [0, 0, img.width, img.height], "crop_bytes": buf.getvalue()}]
            return {"available": True, "degraded": False, "regions": regions, "reason": None}
        except Exception as exc:
            buf = BytesIO()
            img.save(buf, format="JPEG")
            return {
                "available": False,
                "degraded": True,
                "regions": [{"bbox": [0, 0, img.width, img.height], "crop_bytes": buf.getvalue()}],
                "reason": f"detector inference failed: {exc}",
            }
