"""DrugScan end-to-end pipeline orchestrator (PRD §10.1).

Runs the full confidence-gated, multi-signal pill-ID + counterfeit-verification
pipeline and produces:
  - identified_drug, identified_ndc, id_confidence
  - authenticity verdict (verified | inconclusive | suspect)
  - auth_layers (per-layer breakdown JSON) and raw_analysis JSON

These map directly to `record_scan_result`. Each layer degrades honestly; the
verdict and confidence reflect only the signals actually available.
"""

from __future__ import annotations

from typing import Any

from app.integrations.dailymed import DailyMedClient
from app.integrations.dscsa_vrs import DSCSAVerificationProvider, ProductIdentifier
from app.integrations.openfda import OpenFDAClient
from app.integrations import anthropic as claude
from app.kb.postgres import get_kb
from app.models.pill_id.attributes import (
    apply_attribute_filter,
    estimate_dominant_color,
)
from app.models.pill_id.barcode import BarcodeDecoder
from app.models.pill_id.detector import PillDetector
from app.models.pill_id.embedder import PillEmbedder
from app.models.pill_id.fusion import aggregate_authenticity, fuse_identification
from app.models.pill_id.imprint_ocr import ImprintOCR


class DrugScanPipeline:
    def __init__(self) -> None:
        self.detector = PillDetector()
        self.imprint = ImprintOCR()
        self.embedder = PillEmbedder()
        self.barcode = BarcodeDecoder()
        self.openfda = OpenFDAClient()
        self.dailymed = DailyMedClient()
        self.vrs = DSCSAVerificationProvider()
        self.kb = get_kb()

    def status(self) -> dict[str, Any]:
        return {
            "detector": self.detector.status(),
            "imprintOcr": self.imprint.status(),
            "embedder": self.embedder.status(),
            "barcode": self.barcode.status(),
            "serializedVerification": {
                "available": self.vrs.configured,
                "reason": None if self.vrs.configured else "ATP/VRS credentials not configured",
            },
            "claudeVision": {
                "available": claude.is_available(),
                "reason": claude.availability_reason(),
            },
        }

    async def run(self, image_bytes: bytes, scan_type: str) -> dict[str, Any]:
        layers: dict[str, Any] = {}

        # --- Layer 1: detection ---
        det = self.detector.detect(image_bytes)
        layers["detection"] = {
            "available": det.get("available"),
            "degraded": det.get("degraded"),
            "regionCount": len(det.get("regions", [])),
            "reason": det.get("reason"),
        }
        regions = det.get("regions", [])
        primary_crop = regions[0]["crop_bytes"] if regions else image_bytes

        # --- Counterfeit layer 1: barcode (server-side GS1 DataMatrix) ---
        bc = self.barcode.decode(image_bytes)
        layers["barcode"] = bc

        # --- Layer 2: imprint OCR ---
        imprint_result = self.imprint.read(primary_crop)

        # --- Layer 3: embedding + NN over gallery ---
        emb_candidates: list[dict[str, Any]] = []
        emb_result = self.embedder.embed(primary_crop)
        if emb_result.get("available") and self.kb.configured:
            gallery = await self.kb.all_pill_embeddings()
            emb_candidates = self.embedder.nearest_neighbors(emb_result["embedding"], gallery)

        # --- Layer 4: attributes ---
        color = estimate_dominant_color(primary_crop)
        imprint_matches: list[dict[str, Any]] = []
        if imprint_result.get("available") and imprint_result.get("imprint") and self.kb.configured:
            imprint_matches = await self.kb.pill_reference_by_imprint(imprint_result["imprint"])
        attribute_pool = emb_candidates + imprint_matches
        attribute_filtered = apply_attribute_filter(attribute_pool, color=color)

        # --- Fusion + calibration ---
        fused = fuse_identification(
            imprint_result, emb_candidates, attribute_filtered, imprint_matches
        )
        layers.update(fused["layers"])

        top = fused["allCandidates"][0] if fused["allCandidates"] else None
        identified_ndc = ""
        identified_drug = ""
        id_confidence = fused["topConfidence"]
        if fused["autoIdentify"] and top:
            identified_ndc = top.get("ndc") or ""
            identified_drug = top.get("name") or top.get("generic_name") or ""
        # else: low confidence -> require user confirmation; leave identity blank,
        # surface top-3 in raw_analysis (never assert a single identity).

        # --- Counterfeit layer 2: NDC validity ---
        ndc_to_check = identified_ndc or (bc.get("ndc") if bc.get("found") else "")
        layers["ndcValidity"] = {"checked": False}
        if ndc_to_check:
            ndc_res = await self.openfda.validate_ndc(ndc_to_check)
            layers["ndcValidity"] = {"checked": True, **ndc_res}

        # --- Counterfeit layer 3: recall / enforcement ---
        layers["recall"] = {"checked": False, "matches": []}
        if ndc_to_check:
            recalls = await self.openfda.check_recalls_by_ndc(ndc_to_check)
            layers["recall"] = {"checked": True, "matches": recalls}

        # --- Counterfeit layer 4: physical anomaly (Claude vision) ---
        vision = await claude.analyze_packaging(image_bytes)
        if vision.get("available"):
            layers["physicalAnomaly"] = {"available": True, **vision.get("analysis", {})}
        else:
            layers["physicalAnomaly"] = {"available": False, "reason": vision.get("reason")}

        # --- Counterfeit layer 5: serialized VRS (credential-gated) ---
        if bc.get("found") and bc.get("gtin") and bc.get("serial") and self.vrs.configured:
            vres = await self.vrs.verify(
                ProductIdentifier(
                    gtin=bc["gtin"], serial_number=bc["serial"], lot=bc.get("lot"), expiry=bc.get("expiry")
                )
            )
            layers["serializedVerification"] = {
                "available": vres.available,
                "status": vres.status,
                "detail": vres.detail,
            }
        else:
            layers["serializedVerification"] = {
                "available": False,
                "status": "unavailable",
                "detail": "serialized verification unavailable — ATP credentials not configured"
                if not self.vrs.configured
                else "no serialized barcode present",
            }

        # --- Aggregate verdict ---
        verdict = aggregate_authenticity(layers)

        raw_analysis = {
            "scanType": scan_type,
            "topCandidates": fused["allCandidates"][:3],
            "autoIdentify": fused["autoIdentify"],
            "requiresUserConfirmation": not fused["autoIdentify"],
            "verdict": verdict,
            "color": color,
            "imprint": imprint_result.get("imprint"),
        }

        return {
            "identified_drug": identified_drug,
            "identified_ndc": identified_ndc,
            "id_confidence": float(id_confidence),
            "authenticity": verdict["verdict"],
            "auth_layers": layers,
            "raw_analysis": raw_analysis,
        }


_instance: DrugScanPipeline | None = None


def get_pipeline() -> DrugScanPipeline:
    global _instance
    if _instance is None:
        _instance = DrugScanPipeline()
    return _instance
