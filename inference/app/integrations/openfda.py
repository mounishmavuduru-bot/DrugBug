"""openFDA integration (PRD §12, §10.1 layers 2-3).

- NDC Directory  (/drug/ndc.json)        -> validate an NDC maps to a real,
  FDA-registered product; surface labeler / brand / generic / dosage form.
- Drug Enforcement (/drug/enforcement.json) -> recall / illegitimacy checks by
  NDC, product description, or recall number.

API key is optional (raises the rate limit). All real, async httpx.
Docs: https://open.fda.gov/apis/
"""

from __future__ import annotations

import re
from typing import Any

import httpx

from app.config import get_settings


def normalize_ndc(ndc: str) -> str:
    """Normalize a packaged or product NDC to a comparable digit string.

    NDCs appear in 10-digit (4-4-2 / 5-3-2 / 5-4-1) and 11-digit forms with or
    without hyphens. We keep the hyphenated and the digits-only forms so callers
    can match either representation openFDA stores.
    """
    return re.sub(r"[^0-9-]", "", (ndc or "").strip())


def ndc_search_variants(ndc: str) -> list[str]:
    cleaned = normalize_ndc(ndc)
    variants = {cleaned}
    digits = re.sub(r"[^0-9]", "", cleaned)
    if digits:
        variants.add(digits)
    return [v for v in variants if v]


class OpenFDAClient:
    def __init__(self, timeout: float = 10.0) -> None:
        settings = get_settings()
        self.base = settings.openfda_base.rstrip("/")
        self.api_key = settings.openfda_api_key
        self.timeout = timeout

    def _params(self, extra: dict[str, Any]) -> dict[str, Any]:
        params = dict(extra)
        if self.api_key:
            params["api_key"] = self.api_key
        return params

    async def _get(self, path: str, params: dict[str, Any]) -> dict[str, Any]:
        url = f"{self.base}{path}"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(url, params=self._params(params))
            if resp.status_code == 404:
                # openFDA returns 404 with {"error": {"code": "NOT_FOUND"}} on no match.
                return {"results": [], "meta": {"results": {"total": 0}}}
            resp.raise_for_status()
            return resp.json()

    async def validate_ndc(self, ndc: str) -> dict[str, Any]:
        """Confirm an NDC is a real FDA-registered product.

        Returns a layer-2 result dict:
          {valid, ndc, brandName, genericName, labelerName, dosageForm,
           productType, marketingStatus, reason}
        """
        variants = ndc_search_variants(ndc)
        if not variants:
            return {"valid": False, "ndc": ndc, "reason": "empty NDC"}

        # Search both packaging-level and product-level NDC fields.
        query = " OR ".join(
            f'(packaging.package_ndc:"{v}" OR product_ndc:"{v}")' for v in variants
        )
        data = await self._get("/drug/ndc.json", {"search": query, "limit": 1})
        results = data.get("results", [])
        if not results:
            return {
                "valid": False,
                "ndc": ndc,
                "reason": "NDC not found in openFDA NDC Directory",
            }
        r = results[0]
        return {
            "valid": True,
            "ndc": ndc,
            "brandName": r.get("brand_name"),
            "genericName": r.get("generic_name"),
            "labelerName": r.get("labeler_name"),
            "dosageForm": r.get("dosage_form"),
            "productType": r.get("product_type"),
            "marketingStatus": (r.get("marketing_category")),
            "activeIngredients": r.get("active_ingredients"),
            "reason": None,
        }

    async def check_recalls_by_ndc(self, ndc: str, limit: int = 5) -> list[dict[str, Any]]:
        """Return openFDA enforcement (recall) records matching this NDC."""
        variants = ndc_search_variants(ndc)
        if not variants:
            return []
        # Enforcement records embed NDCs inside free-text fields; search broadly.
        terms = " OR ".join(f'(product_description:"{v}" OR code_info:"{v}")' for v in variants)
        try:
            data = await self._get("/drug/enforcement.json", {"search": terms, "limit": limit})
        except httpx.HTTPError:
            return []
        return [self._recall_row(r) for r in data.get("results", [])]

    async def search_recalls_by_term(self, term: str, limit: int = 10) -> list[dict[str, Any]]:
        """Recall search by product/brand/generic term (used by the recall monitor)."""
        term = (term or "").strip()
        if not term:
            return []
        query = f'product_description:"{term}"'
        try:
            data = await self._get("/drug/enforcement.json", {"search": query, "limit": limit})
        except httpx.HTTPError:
            return []
        return [self._recall_row(r) for r in data.get("results", [])]

    @staticmethod
    def _recall_row(r: dict[str, Any]) -> dict[str, Any]:
        return {
            "recallNumber": r.get("recall_number"),
            "status": r.get("status"),
            "classification": r.get("classification"),  # Class I/II/III
            "reasonForRecall": r.get("reason_for_recall"),
            "productDescription": r.get("product_description"),
            "recallingFirm": r.get("recalling_firm"),
            "distributionPattern": r.get("distribution_pattern"),
            "reportDate": r.get("report_date"),
            "codeInfo": r.get("code_info"),
        }


async def healthcheck() -> bool:
    try:
        client = OpenFDAClient(timeout=4.0)
        await client._get("/drug/ndc.json", {"limit": 1})
        return True
    except Exception:
        return False
