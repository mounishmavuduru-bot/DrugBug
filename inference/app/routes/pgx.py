"""PharmacoFit routes (contract §pgx, PRD §10.4).

POST /pgx/upload  (multipart: identity, file)
  -> {status}   23andMe/Ancestry raw -> VCF -> PharmCAT -> set_pgx_phenotypes
GET  /pgx/flags?identity=
  -> {flags: [{gene, phenotype, medication, guidance, cpicLevel?}], caveat}
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile

from app.models.pgx.cpic import map_flags
from app.models.pgx.pharmcat import CONSUMER_SNP_CAVEAT, get_pharmcat
from app.spacetime_writeback import SpacetimeError, get_writeback

router = APIRouter(tags=["pgx"])


@router.post("/pgx/upload")
async def upload_genotype(
    identity: str = Form(...),
    file: UploadFile = File(...),
):
    wb = get_writeback()
    if not wb.configured:
        raise HTTPException(status_code=503, detail="SpacetimeDB not configured")

    pharmcat = get_pharmcat()
    status = pharmcat.status()
    if not status["available"]:
        # Honest: PharmCAT not installed (PRD §10.4) — never a fake phenotype.
        raise HTTPException(
            status_code=503,
            detail=f"PharmCAT not installed: {status['reason']}",
        )

    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="empty genotype file")
    try:
        raw_text = raw_bytes.decode("utf-8", errors="replace")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"could not decode file: {exc}")

    result = pharmcat.run(raw_text)
    if not result["available"]:
        raise HTTPException(status_code=502, detail=f"PharmCAT run failed: {result['reason']}")

    phenotypes = result["phenotypes"]
    payload = {
        "phenotypes": phenotypes,
        "caveat": CONSUMER_SNP_CAVEAT,
        "source": "pharmcat",
    }

    # set_pgx_phenotypes rejects unless the subject has consented (reducer-side).
    try:
        await wb.set_pgx_phenotypes(identity, payload)
    except SpacetimeError as exc:
        msg = str(exc)
        if "consent" in msg.lower():
            raise HTTPException(status_code=403, detail="PGx consent not granted")
        raise HTTPException(status_code=502, detail=f"writeback failed: {exc}")

    return {"status": "processed", "genes": list(phenotypes.keys())}


@router.get("/pgx/flags")
async def pgx_flags(identity: str = Query(...)):
    wb = get_writeback()
    if not wb.configured:
        raise HTTPException(status_code=503, detail="SpacetimeDB not configured")

    try:
        profile = await wb.get_profile(identity)
        meds = await wb.get_active_medications(identity)
    except SpacetimeError as exc:
        raise HTTPException(status_code=502, detail=f"failed to read data: {exc}")

    phenotypes = _phenotypes_from_profile(profile)
    if not phenotypes:
        return {"flags": [], "caveat": CONSUMER_SNP_CAVEAT}

    flags = await map_flags(phenotypes, meds)
    return {"flags": flags, "caveat": CONSUMER_SNP_CAVEAT}


def _phenotypes_from_profile(profile: dict[str, Any] | None) -> dict[str, str]:
    if not profile:
        return {}
    raw = profile.get("pgx_phenotypes")
    if not raw:
        return {}
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return {}
    if isinstance(raw, dict):
        pheno = raw.get("phenotypes")
        if isinstance(pheno, dict):
            return {str(k): str(v) for k, v in pheno.items()}
        # Or a flat gene->phenotype dict.
        return {str(k): str(v) for k, v in raw.items() if isinstance(v, str)}
    return {}
