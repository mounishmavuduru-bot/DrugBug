"""DailyMed (NLM) integration (PRD §12, §10.1 layer 4).

Pill physical-characteristic data (shape, color, size, scoring, imprint) and SPL
labeling, used by the DrugScan attribute-filter layer. No API key required.

Docs: https://dailymed.nlm.nih.gov/dailymed/app-support-web-services.cfm
"""

from __future__ import annotations

from typing import Any

import httpx

from app.config import get_settings


class DailyMedClient:
    def __init__(self, timeout: float = 10.0) -> None:
        settings = get_settings()
        self.base = settings.dailymed_base.rstrip("/")
        self.timeout = timeout

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        url = f"{self.base}{path}"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(url, params=params or {})
            resp.raise_for_status()
            return resp.json()

    async def spls_by_ndc(self, ndc: str, limit: int = 5) -> list[dict[str, Any]]:
        """SPL set-ids associated with an NDC."""
        ndc = (ndc or "").strip()
        if not ndc:
            return []
        try:
            data = await self._get(
                "/dailymed/services/v2/spls.json", {"ndc": ndc, "pagesize": limit}
            )
        except httpx.HTTPError:
            return []
        return data.get("data", []) or []

    async def physical_characteristics(self, set_id: str) -> dict[str, Any] | None:
        """Pull packaging/physical-characteristic facets for an SPL set-id.

        Returns shape/color/size/imprint where DailyMed exposes them. DailyMed's
        v2 JSON does not always include the full physical panel; callers treat a
        None / partial result as a soft signal (not a hard fail).
        """
        set_id = (set_id or "").strip()
        if not set_id:
            return None
        try:
            data = await self._get(f"/dailymed/services/v2/spls/{set_id}.json")
        except httpx.HTTPError:
            return None
        products = (data.get("data", {}) or {}).get("products", []) or []
        if not products:
            return None
        p = products[0]
        return {
            "setId": set_id,
            "name": p.get("name"),
            "activeIngredients": p.get("active_ingredients"),
            "dosageForms": p.get("dosage_forms"),
            "marketingCategory": p.get("marketing_category"),
            "ndcs": [pk.get("ndc") for pk in p.get("packaging", []) or []],
        }

    async def attributes_for_ndc(self, ndc: str) -> dict[str, Any] | None:
        """Convenience: resolve SPL by NDC then return physical characteristics."""
        spls = await self.spls_by_ndc(ndc)
        if not spls:
            return None
        set_id = spls[0].get("setid") or spls[0].get("set_id")
        if not set_id:
            return None
        return await self.physical_characteristics(set_id)


async def healthcheck() -> bool:
    try:
        client = DailyMedClient(timeout=4.0)
        await client._get("/dailymed/services/v2/spls.json", {"pagesize": 1})
        return True
    except Exception:
        return False
