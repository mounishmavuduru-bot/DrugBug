"""Drug autocomplete route (contract §search/drugs).

GET /search/drugs?q=  -> {results: [{rxcui, name, genericName, synonym?, tty?}]}
Real RxNorm RxNav approximateTerm/drugs.
"""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.integrations.rxnorm import RxNormClient

router = APIRouter(tags=["search"])


@router.get("/search/drugs")
async def search_drugs(q: str = Query(..., min_length=1)):
    client = RxNormClient()
    results = await client.search_drugs(q)
    return {"results": results}
