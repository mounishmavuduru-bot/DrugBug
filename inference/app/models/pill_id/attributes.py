"""DrugScan layer 4: attribute filters (PRD §10.1).

Shape, color, scoring, and size narrow candidates against FDA DailyMed physical-
characteristic data (and the pill_reference table loaded by ETL). This is a soft
filter that re-weights candidates; it never asserts identity on its own.

Uses pillow (lightweight) for rough color estimation when no attribute is
supplied. The authoritative attribute source is DailyMed / pill_reference.
"""

from __future__ import annotations

from typing import Any

_COLOR_BUCKETS = {
    "white": (235, 235, 235),
    "yellow": (220, 200, 60),
    "orange": (230, 140, 40),
    "pink": (235, 150, 170),
    "red": (200, 40, 40),
    "brown": (130, 90, 50),
    "green": (60, 160, 90),
    "blue": (60, 90, 200),
    "purple": (130, 70, 170),
    "gray": (150, 150, 150),
    "black": (30, 30, 30),
}


def estimate_dominant_color(crop_bytes: bytes) -> str | None:
    """Rough dominant-color bucket for a pill crop (soft hint only)."""
    try:
        from io import BytesIO

        from PIL import Image

        img = Image.open(BytesIO(crop_bytes)).convert("RGB").resize((32, 32))
        pixels = list(img.getdata())
        # Average ignoring near-black background fringe.
        rs, gs, bs, n = 0, 0, 0, 0
        for r, g, b in pixels:
            if r + g + b < 60:  # skip very dark background
                continue
            rs += r
            gs += g
            bs += b
            n += 1
        if n == 0:
            return None
        avg = (rs / n, gs / n, bs / n)
        best, best_d = None, 1e9
        for name, ref in _COLOR_BUCKETS.items():
            d = sum((a - b) ** 2 for a, b in zip(avg, ref))
            if d < best_d:
                best_d, best = d, name
        return best
    except Exception:
        return None


def attribute_match_score(
    candidate: dict[str, Any],
    shape: str | None = None,
    color: str | None = None,
    scoring: str | None = None,
    size_mm: float | None = None,
) -> float:
    """Score 0..1 of how well a reference candidate matches observed attributes.

    Each provided attribute contributes; missing attributes are skipped (not
    penalized), so a partial observation still produces a usable score.
    """
    checks: list[float] = []
    if shape and candidate.get("shape"):
        checks.append(1.0 if str(candidate["shape"]).lower() == shape.lower() else 0.0)
    if color and candidate.get("color"):
        checks.append(1.0 if color.lower() in str(candidate["color"]).lower() else 0.0)
    if scoring and candidate.get("scoring"):
        checks.append(1.0 if str(candidate["scoring"]).lower() == scoring.lower() else 0.0)
    if size_mm and candidate.get("size_mm"):
        try:
            diff = abs(float(candidate["size_mm"]) - float(size_mm))
            checks.append(max(0.0, 1.0 - diff / 5.0))  # within 5mm tolerance
        except (TypeError, ValueError):
            pass
    if not checks:
        return 0.5  # neutral when nothing to compare
    return sum(checks) / len(checks)


def apply_attribute_filter(
    candidates: list[dict[str, Any]],
    shape: str | None = None,
    color: str | None = None,
    scoring: str | None = None,
    size_mm: float | None = None,
) -> list[dict[str, Any]]:
    """Annotate candidates with an `attribute_score` field."""
    out = []
    for c in candidates:
        score = attribute_match_score(c, shape, color, scoring, size_mm)
        out.append({**c, "attribute_score": round(score, 4)})
    return out
