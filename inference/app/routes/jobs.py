"""Scheduled-job routes (PRD §10.7 recall monitoring).

POST /jobs/recall-monitor  -> triggers the openFDA enforcement poll for all (or
                              given) users' active meds, writing record_recall_alert.
Intended to be invoked by a cron/scheduler daily.
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.jobs import run_recall_monitor

router = APIRouter(tags=["jobs"])


class RecallMonitorRequest(BaseModel):
    identities: list[str] | None = None


@router.post("/jobs/recall-monitor")
async def recall_monitor(req: RecallMonitorRequest | None = None):
    identities = req.identities if req else None
    result = await run_recall_monitor(identities)
    return result
