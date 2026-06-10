"""Interactions routes (contract §interactions).

POST /interactions/check     -> synchronous, no writeback. Pre-commit check.
POST /interactions/recompute -> pulls user meds from SpacetimeDB, runs
                                KB+GNN+cascade, writes back via
                                record_interaction_result.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models.cascade_gnn.engine import (
    compute_report,
    drugs_from_medication_rows,
    resolve_drugs_from_rxcuis,
)
from app.spacetime_writeback import SpacetimeError, get_writeback

router = APIRouter(tags=["interactions"])


class CheckRequest(BaseModel):
    rxcuis: list[str]
    identity: str


class RecomputeRequest(BaseModel):
    identity: str


@router.post("/interactions/check")
async def check_interactions(req: CheckRequest):
    """Synchronous pre-commit interaction check (no writeback).

    Returns the client's InteractionReport: {pairs, cascades, hasMajor,
    modelVersion, kbVersion}.
    """
    drugs = await resolve_drugs_from_rxcuis(req.rxcuis)
    report = await compute_report(drugs)
    # The client InteractionReport does not include the `gnn` status field; keep
    # it out of the synchronous response shape but leave pairs/cascades intact.
    return {
        "pairs": report["pairs"],
        "cascades": report["cascades"],
        "hasMajor": report["hasMajor"],
        "modelVersion": report["modelVersion"],
        "kbVersion": report["kbVersion"],
    }


@router.post("/interactions/recompute")
async def recompute_interactions(req: RecomputeRequest):
    """Recompute + persist the full interaction/cascade set for a user."""
    wb = get_writeback()
    if not wb.configured:
        raise HTTPException(
            status_code=503,
            detail="SpacetimeDB writeback not configured (SPACETIME_SERVICE_TOKEN missing)",
        )
    try:
        med_rows = await wb.get_active_medications(req.identity)
    except SpacetimeError as exc:
        raise HTTPException(status_code=502, detail=f"failed to read meds: {exc}")

    drugs = drugs_from_medication_rows(med_rows)
    report = await compute_report(drugs)

    try:
        await wb.record_interaction_result(
            req.identity,
            report["pairs"],
            report["cascades"],
            report["modelVersion"],
            report["kbVersion"],
        )
    except SpacetimeError as exc:
        raise HTTPException(status_code=502, detail=f"writeback failed: {exc}")

    return {"status": "recomputed", "pairs": len(report["pairs"]), "cascades": len(report["cascades"])}
