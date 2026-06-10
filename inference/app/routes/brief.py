"""AppointmentPrep brief route (contract §brief, PRD §10.5).

POST /brief/generate {identity, appt_id?, provider_type?}
  -> {briefRef, status}

Composes the user's REAL data (meds, 30-day adherence, side effects + statistical
associations, interactions/cascades, PGx flags, refill issues), Claude generates
the brief, it is stored in object storage, and attach_brief is called when an
appt_id is supplied. Claude is instructed to use only provided data and invent
nothing (PRD §10.5).
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.integrations import anthropic as claude
from app.models.adherence.features import _ts_to_dt
from app.patterns import find_patterns
from app.spacetime_writeback import SpacetimeError, get_writeback
from app.storage import get_storage

router = APIRouter(tags=["brief"])


class BriefRequest(BaseModel):
    identity: str
    appt_id: str | None = None
    provider_type: str | None = None


def _adherence_summary(doses: list[dict[str, Any]]) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    window_start = now.timestamp() - 30 * 86400
    taken = late = missed = skipped = total = 0
    for d in doses:
        dt = _ts_to_dt(d.get("scheduled_at"))
        if dt is None or dt.timestamp() < window_start:
            continue
        status = (d.get("status") or "").lower()
        if status not in ("taken", "late", "missed", "skipped"):
            continue
        total += 1
        if status == "taken":
            taken += 1
        elif status == "late":
            late += 1
        elif status == "missed":
            missed += 1
        elif status == "skipped":
            skipped += 1
    on_time_rate = round((taken / total) * 100, 1) if total else None
    return {
        "windowDays": 30,
        "totalGradedDoses": total,
        "taken": taken,
        "late": late,
        "missed": missed,
        "skipped": skipped,
        "onTimeRatePct": on_time_rate,
    }


def _refill_issues(meds: list[dict[str, Any]]) -> list[dict[str, Any]]:
    issues = []
    for m in meds:
        remaining = m.get("doses_remaining")
        if isinstance(remaining, (int, float)) and remaining <= 7:
            issues.append(
                {
                    "medication": m.get("name") or m.get("generic_name"),
                    "dosesRemaining": remaining,
                }
            )
    return issues


@router.post("/brief/generate")
async def generate_brief(req: BriefRequest):
    wb = get_writeback()
    if not wb.configured:
        raise HTTPException(status_code=503, detail="SpacetimeDB not configured")

    if not claude.is_available():
        # Honest: brief generation requires Claude (PRD §11). No fake brief.
        raise HTTPException(
            status_code=503,
            detail=f"brief generation unavailable: {claude.availability_reason()}",
        )

    try:
        profile = await wb.get_profile(req.identity)
        meds = await wb.get_active_medications(req.identity)
        doses = await wb.get_doses(req.identity)
        effects = await wb.get_side_effects(req.identity)
        cache = await wb.get_interactions_cache(req.identity)
    except SpacetimeError as exc:
        raise HTTPException(status_code=502, detail=f"failed to read data: {exc}")

    patterns = find_patterns(meds, doses, effects)

    pairs = cascades = []
    if cache:
        pairs = _maybe_json(cache.get("pairs"))
        cascades = _maybe_json(cache.get("cascades"))

    pgx_flags = _maybe_json(profile.get("pgx_phenotypes")) if profile else {}

    brief_input = {
        "providerType": req.provider_type,
        "patient": {
            "conditions": (profile or {}).get("conditions"),
            "allergies": (profile or {}).get("allergies"),
        },
        "currentMedications": [
            {
                "name": m.get("name"),
                "genericName": m.get("generic_name"),
                "strength": m.get("strength"),
                "form": m.get("form"),
                "scheduleTimes": m.get("schedule_times"),
                "prn": m.get("prn"),
                "prescriber": m.get("prescriber"),
            }
            for m in meds
        ],
        "adherenceSummary": _adherence_summary(doses),
        "sideEffects": [
            {"symptom": e.get("symptom"), "severity": e.get("severity")} for e in effects
        ],
        "statisticalAssociations": patterns,
        "interactions": pairs,
        "cascades": cascades,
        "pgxFlags": pgx_flags,
        "refillIssues": _refill_issues(meds),
    }

    result = await claude.generate_brief(brief_input)
    if not result.get("available"):
        raise HTTPException(status_code=502, detail=f"brief generation failed: {result.get('reason')}")

    storage = get_storage()
    brief_ref = storage.put_text(f"briefs/{req.identity}", result["markdown"], ext="md")

    if req.appt_id:
        try:
            await wb.attach_brief(int(req.appt_id), brief_ref)
        except (ValueError, SpacetimeError) as exc:
            raise HTTPException(status_code=502, detail=f"attach_brief failed: {exc}")

    return {"briefRef": brief_ref, "status": "generated"}


def _maybe_json(value: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    return value if value is not None else []
