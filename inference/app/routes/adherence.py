"""Adherence + patterns routes (contract §adherence, §patterns).

GET /adherence/forecast?identity=  -> {forecasts: [{doseId, scheduledAt, pMiss}]}
GET /patterns/side-effects?identity= -> {patterns: [{medication, symptom, r, n, lagHours}]}
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query

from app.models.adherence.features import _ts_to_dt
from app.models.adherence.forecaster import get_forecaster
from app.patterns import find_patterns
from app.spacetime_writeback import SpacetimeError, get_writeback

router = APIRouter(tags=["adherence"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


@router.get("/adherence/forecast")
async def adherence_forecast(identity: str = Query(...)):
    wb = get_writeback()
    if not wb.configured:
        raise HTTPException(status_code=503, detail="SpacetimeDB not configured")
    try:
        doses = await wb.get_doses(identity)
        meds = await wb.get_active_medications(identity)
    except SpacetimeError as exc:
        raise HTTPException(status_code=502, detail=f"failed to read data: {exc}")

    now = _now()
    upcoming = [
        d
        for d in doses
        if (d.get("status") or "").lower() == "pending"
        and (_ts_to_dt(d.get("scheduled_at")) or now) >= now
    ]
    history = [d for d in doses if (d.get("status") or "").lower() in ("taken", "late", "missed", "skipped")]

    forecaster = get_forecaster()
    result = forecaster.forecast(upcoming, history, total_daily_med_count=len(meds))
    return {"forecasts": result.get("forecasts", [])}


@router.get("/patterns/side-effects")
async def side_effect_patterns(identity: str = Query(...)):
    wb = get_writeback()
    if not wb.configured:
        raise HTTPException(status_code=503, detail="SpacetimeDB not configured")
    try:
        meds = await wb.get_active_medications(identity)
        doses = await wb.get_doses(identity)
        effects = await wb.get_side_effects(identity)
    except SpacetimeError as exc:
        raise HTTPException(status_code=502, detail=f"failed to read data: {exc}")

    patterns = find_patterns(meds, doses, effects)
    return {"patterns": patterns}
