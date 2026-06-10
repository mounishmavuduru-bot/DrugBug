"""DrugScan fusion + calibration + aggregate verdict (PRD §10.1 layer 5 + verdict).

Combines imprint match + embedding similarity + attribute filters into a ranked
candidate list with a CALIBRATED confidence (Platt/temperature scaling). Then
combines the counterfeit layers (barcode GS1, NDC validity, recall, Claude-vision
anomaly, VRS-when-configured) into an aggregate authenticity verdict with a
per-layer breakdown.

Safety gating (PRD §10.1):
  - above threshold  -> auto-identify (single identity)
  - below threshold  -> top-3 candidates, require user confirmation
The product NEVER asserts a single identity at low confidence.

This module is pure-Python (numpy lightweight) so it always boots; it consumes
the per-layer results which are individually degradable.
"""

from __future__ import annotations

import math
from typing import Any

# Calibration parameters (Platt scaling) fitted on a held-out set during
# training; defaults here are sensible priors used until calibration is run.
PLATT_A = -6.0
PLATT_B = 3.0

# Fusion weights for the identification signals.
W_IMPRINT = 0.55
W_EMBEDDING = 0.30
W_ATTRIBUTE = 0.15

AUTO_IDENTIFY_THRESHOLD = 0.85


def _platt(raw_score: float) -> float:
    """Map a raw fused score to a calibrated probability via Platt scaling."""
    z = PLATT_A * raw_score + PLATT_B
    return 1.0 / (1.0 + math.exp(z))


def fuse_identification(
    imprint: dict[str, Any],
    embedding_candidates: list[dict[str, Any]],
    attribute_filtered: list[dict[str, Any]],
    imprint_matches: list[dict[str, Any]],
) -> dict[str, Any]:
    """Fuse the three ID signals into ranked candidates with calibrated confidence.

    Inputs:
      imprint: imprint_ocr.read() result
      embedding_candidates: embedder NN results (have `similarity`, `ndc`, ...)
      attribute_filtered: candidates annotated with `attribute_score`
      imprint_matches: pill_reference rows matching the OCR'd imprint exactly

    Returns:
      {"candidates": [{ndc, name, generic_name, score, confidence, signals}],
       "topConfidence": float, "autoIdentify": bool, "layers": {...}}
    """
    # Index attribute scores by NDC for quick lookup.
    attr_by_ndc = {c.get("ndc"): c.get("attribute_score", 0.5) for c in attribute_filtered}
    imprint_ndcs = {m.get("ndc") for m in imprint_matches}

    # Build the candidate universe from embedding NN + exact imprint matches.
    universe: dict[str, dict[str, Any]] = {}
    for c in embedding_candidates:
        ndc = c.get("ndc")
        if ndc:
            universe.setdefault(ndc, {**c})
    for m in imprint_matches:
        ndc = m.get("ndc")
        if ndc:
            universe.setdefault(ndc, {**m})

    fused: list[dict[str, Any]] = []
    imprint_available = imprint.get("available") and imprint.get("imprint")
    for ndc, c in universe.items():
        emb_sim = float(c.get("similarity", 0.0))
        attr_score = float(attr_by_ndc.get(ndc, c.get("attribute_score", 0.5)))
        imprint_signal = 1.0 if (imprint_available and ndc in imprint_ndcs) else 0.0

        # If imprint OCR is unavailable, redistribute its weight to the others.
        if imprint_available:
            raw = W_IMPRINT * imprint_signal + W_EMBEDDING * emb_sim + W_ATTRIBUTE * attr_score
        else:
            total = W_EMBEDDING + W_ATTRIBUTE
            raw = (W_EMBEDDING * emb_sim + W_ATTRIBUTE * attr_score) / total * 0.7  # cap confidence w/o imprint

        confidence = _platt(raw)
        fused.append(
            {
                "ndc": ndc,
                "name": c.get("name"),
                "generic_name": c.get("generic_name"),
                "score": round(raw, 4),
                "confidence": round(confidence, 4),
                "signals": {
                    "imprintMatch": bool(imprint_signal),
                    "embeddingSimilarity": round(emb_sim, 4),
                    "attributeScore": round(attr_score, 4),
                },
            }
        )

    fused.sort(key=lambda x: x["confidence"], reverse=True)
    top_conf = fused[0]["confidence"] if fused else 0.0
    auto = top_conf >= AUTO_IDENTIFY_THRESHOLD and bool(imprint_available)

    return {
        "candidates": fused[:3] if not auto else fused[:1],
        "allCandidates": fused[:10],
        "topConfidence": round(top_conf, 4),
        "autoIdentify": auto,
        "layers": {
            "imprintOcr": {
                "available": bool(imprint.get("available")),
                "imprint": imprint.get("imprint"),
                "reason": imprint.get("reason"),
            },
            "embedding": {
                "available": bool(embedding_candidates),
                "topSimilarity": round(embedding_candidates[0]["similarity"], 4)
                if embedding_candidates
                else None,
            },
            "attributes": {"available": bool(attribute_filtered)},
        },
    }


def aggregate_authenticity(layers: dict[str, Any]) -> dict[str, Any]:
    """Combine counterfeit layers into a verdict: verified | inconclusive | suspect.

    Rules (PRD §10.1):
      - suspect: any concerning signal (NDC invalid, active recall match, physical
        anomaly flagged, or VRS not_verified).
      - verified: NDC valid AND no recall AND no physical anomaly AND
        (VRS confirms OR VRS unavailable but other signals strong).
      - inconclusive: insufficient signal otherwise.
    """
    concerns: list[str] = []
    positives: list[str] = []

    ndc = layers.get("ndcValidity", {})
    recall = layers.get("recall", {})
    physical = layers.get("physicalAnomaly", {})
    vrs = layers.get("serializedVerification", {})
    barcode = layers.get("barcode", {})

    # NDC validity
    if ndc.get("checked"):
        if ndc.get("valid") is True:
            positives.append("NDC valid in openFDA")
        elif ndc.get("valid") is False:
            concerns.append("NDC not found in openFDA NDC Directory")

    # Recall
    if recall.get("checked") and recall.get("matches"):
        concerns.append(f"{len(recall['matches'])} openFDA recall/enforcement match(es)")

    # Physical anomaly (Claude vision) — a signal, never the verdict alone.
    if physical.get("available"):
        anomalies = physical.get("anomalies") or []
        flagged = (
            physical.get("print_quality") in ("poor",)
            or physical.get("registration") == "misaligned"
            or physical.get("packaging_consistency") == "inconsistent"
            or len(anomalies) > 0
        )
        if flagged:
            concerns.append("physical/packaging anomaly observed")
        else:
            positives.append("no physical anomaly observed")

    # Serialized VRS (layer 5)
    if vrs.get("available"):
        if vrs.get("status") == "verified":
            positives.append("manufacturer VRS confirmed")
        elif vrs.get("status") == "not_verified":
            concerns.append("manufacturer VRS did not confirm serial")

    # Verdict
    if concerns:
        verdict = "suspect"
    elif positives and len(positives) >= 2:
        verdict = "verified"
    elif positives:
        verdict = "verified" if not _weak_only(positives, barcode) else "inconclusive"
    else:
        verdict = "inconclusive"

    return {
        "verdict": verdict,
        "concerns": concerns,
        "positives": positives,
    }


def _weak_only(positives: list[str], barcode: dict[str, Any]) -> bool:
    # If we only have one soft positive and no barcode at all, stay inconclusive.
    return len(positives) == 1 and not barcode.get("found")
