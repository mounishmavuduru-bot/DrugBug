"""Async job execution for the scan pipeline + the recall monitor (PRD §10.1/§10.7).

The scan endpoint returns immediately ({scanId, status:"processing"}) and the
heavy pipeline runs in the background. A Redis-backed queue is used when
REDIS_URL is configured (so workers can be scaled out); otherwise the job runs
in-process via FastAPI BackgroundTasks. Either way the result is written back via
record_scan_result / fail_scan.

redis is a lightweight boot dep. The recall monitor is exposed for the /jobs
scheduler (daily openFDA enforcement poll).
"""

from __future__ import annotations

import json
import traceback
from typing import Any

from app.config import get_settings
from app.integrations.openfda import OpenFDAClient
from app.models.pill_id.pipeline import get_pipeline
from app.spacetime_writeback import get_writeback

SCAN_QUEUE = "drugbug:scan:queue"


async def process_scan(scan_id: int, identity: str, scan_type: str, image_bytes: bytes) -> None:
    """Run the DrugScan pipeline and write the result back to SpacetimeDB."""
    wb = get_writeback()
    pipeline = get_pipeline()
    try:
        result = await pipeline.run(image_bytes, scan_type)
        await wb.record_scan_result(
            scan_id=scan_id,
            identified_drug=result["identified_drug"],
            identified_ndc=result["identified_ndc"],
            id_confidence=result["id_confidence"],
            authenticity=result["authenticity"],
            auth_layers=result["auth_layers"],
            raw_analysis=result["raw_analysis"],
        )
    except Exception as exc:  # pragma: no cover - defensive
        reason = f"{exc}"
        try:
            await wb.fail_scan(scan_id, reason[:300])
        except Exception:
            traceback.print_exc()


# ---------------------------------------------------------------------------
# Redis queue (optional, for out-of-process workers)
# ---------------------------------------------------------------------------
def redis_client():
    settings = get_settings()
    if not settings.redis_configured:
        return None
    try:
        import redis.asyncio as aioredis

        return aioredis.from_url(settings.redis_url)
    except Exception:
        return None


async def enqueue_scan_job(scan_id: int, identity: str, scan_type: str, image_ref: str) -> bool:
    """Push a scan job onto the Redis queue. Returns True if enqueued.

    The image itself is stored in object storage; the queue carries the ref so
    a worker can fetch and process it. Returns False when Redis is unavailable
    (caller then falls back to in-process processing).
    """
    client = redis_client()
    if client is None:
        return False
    payload = json.dumps(
        {"scan_id": scan_id, "identity": identity, "scan_type": scan_type, "image_ref": image_ref}
    )
    try:
        await client.rpush(SCAN_QUEUE, payload)
        return True
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Recall monitor (PRD §10.7) — daily openFDA enforcement poll
# ---------------------------------------------------------------------------
async def run_recall_monitor(identities: list[str] | None = None) -> dict[str, Any]:
    """Poll openFDA enforcement for recalls matching users' active meds.

    For each active medication, search by NDC and by product/generic name; new
    matches are written via record_recall_alert (deduped server-side by the
    reducer). If `identities` is None, processes all profiles found via SQL.
    """
    wb = get_writeback()
    openfda = OpenFDAClient()
    if not wb.configured:
        return {"status": "skipped", "reason": "SpacetimeDB writeback not configured"}

    if identities is None:
        profiles = await wb.sql("SELECT identity FROM profiles")
        identities = [p.get("identity") for p in profiles if p.get("identity")]

    alerts_created = 0
    for identity in identities:
        try:
            meds = await wb.get_active_medications(identity)
        except Exception:
            continue
        for med in meds:
            ndc = (med.get("ndc") or "").strip()
            name = (med.get("name") or med.get("generic_name") or "").strip()
            matches: list[dict[str, Any]] = []
            if ndc:
                matches += await openfda.check_recalls_by_ndc(ndc)
            if name:
                matches += await openfda.search_recalls_by_term(name, limit=5)
            for m in matches:
                recall_id = m.get("recallNumber") or ""
                if not recall_id:
                    continue
                severity = _classification_to_severity(m.get("classification"))
                summary = (m.get("reasonForRecall") or m.get("productDescription") or "")[:480]
                try:
                    await wb.record_recall_alert(
                        identity, int(med.get("med_id") or 0), recall_id, severity, summary
                    )
                    alerts_created += 1
                except Exception:
                    continue
    return {"status": "ok", "alertsProcessed": alerts_created}


def _classification_to_severity(classification: str | None) -> str:
    c = (classification or "").lower()
    if "class i" in c and "class ii" not in c and "class iii" not in c:
        return "high"
    if "class ii" in c:
        return "medium"
    return "low"
