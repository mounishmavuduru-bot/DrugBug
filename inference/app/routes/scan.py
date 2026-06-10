"""DrugScan route (contract §scan).

POST /scan  (multipart: scan_id, identity, scan_type, image)
  -> {scanId, status}
Stores the image in object storage, runs the pipeline async (Redis job when
configured, else in-process BackgroundTask), and writes back via
record_scan_result / fail_scan.
"""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile

from app.jobs import enqueue_scan_job, process_scan
from app.spacetime_writeback import get_writeback
from app.storage import get_storage

router = APIRouter(tags=["scan"])


@router.post("/scan")
async def submit_scan(
    background: BackgroundTasks,
    scan_id: str = Form(...),
    identity: str = Form(...),
    scan_type: str = Form(...),
    image: UploadFile = File(...),
):
    wb = get_writeback()
    if not wb.configured:
        raise HTTPException(
            status_code=503,
            detail="SpacetimeDB writeback not configured (SPACETIME_SERVICE_TOKEN missing)",
        )

    try:
        scan_id_int = int(scan_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="scan_id must be an integer")

    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="empty image upload")

    # Persist the image (object storage / local fallback) for audit + workers.
    storage = get_storage()
    content_type = image.content_type or "image/jpeg"
    ext = "jpg" if "jpeg" in content_type or "jpg" in content_type else content_type.split("/")[-1]
    image_ref = storage.put_bytes(f"scans/{identity}", image_bytes, content_type, ext)

    # Try Redis queue first (scalable, out-of-process workers); fall back to
    # an in-process background task so the pipeline still completes in dev.
    enqueued = await enqueue_scan_job(scan_id_int, identity, scan_type, image_ref)
    if not enqueued:
        background.add_task(process_scan, scan_id_int, identity, scan_type, image_bytes)

    return {"scanId": str(scan_id_int), "status": "processing"}
