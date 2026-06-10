"""RxNorm / NLM RxNav integration (PRD §12). No API key required.

Provides drug-name autocomplete (approximateTerm / drugs) and ATC therapeutic
class lookup used by the missed-dose classifier and CascadeMap node typing.

Docs: https://lhncbc.nlm.nih.gov/RxNav/APIs/
"""

from __future__ import annotations

from typing import Any

import httpx

from app.config import get_settings


class RxNormClient:
    def __init__(self, base: str | None = None, timeout: float = 8.0) -> None:
        settings = get_settings()
        self.base = (base or settings.rxnav_base).rstrip("/")
        self.timeout = timeout

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        url = f"{self.base}{path}"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(url, params=params or {})
            resp.raise_for_status()
            return resp.json()

    async def search_drugs(self, query: str, max_entries: int = 12) -> list[dict[str, Any]]:
        """Autocomplete via approximateTerm, enriched to ingredient generic names.

        Returns list of {rxcui, name, genericName, synonym?, tty?} — the exact
        shape the client's DrugSuggestion expects.
        """
        query = (query or "").strip()
        if not query:
            return []

        data = await self._get(
            "/REST/approximateTerm.json",
            {"term": query, "maxEntries": max_entries, "option": 0},
        )
        candidates = (
            data.get("approximateGroup", {}).get("candidate", []) if data else []
        )

        results: list[dict[str, Any]] = []
        seen: set[str] = set()
        for cand in candidates:
            rxcui = str(cand.get("rxcui", "")).strip()
            if not rxcui or rxcui in seen:
                continue
            seen.add(rxcui)
            name = cand.get("name") or ""
            tty = cand.get("tty") or ""
            generic = await self._best_generic(rxcui, fallback=name)
            results.append(
                {
                    "rxcui": rxcui,
                    "name": name,
                    "genericName": generic,
                    "synonym": cand.get("name") if cand.get("name") != name else None,
                    "tty": tty or None,
                }
            )
            if len(results) >= max_entries:
                break
        return results

    async def _best_generic(self, rxcui: str, fallback: str = "") -> str:
        """Resolve a concept's ingredient (IN) name for use as generic_name."""
        try:
            data = await self._get(
                f"/REST/rxcui/{rxcui}/related.json", {"tty": "IN+MIN"}
            )
        except httpx.HTTPError:
            return fallback
        groups = data.get("relatedGroup", {}).get("conceptGroup", []) or []
        for group in groups:
            props = group.get("conceptProperties") or []
            if props:
                return props[0].get("name", fallback)
        return fallback

    async def related_rxcuis(self, rxcui: str, ttys: str = "IN+PIN+MIN") -> list[str]:
        """Return related ingredient-level rxcuis (used to normalize a med to its
        active-ingredient nodes for the interaction graph)."""
        try:
            data = await self._get(f"/REST/rxcui/{rxcui}/related.json", {"tty": ttys})
        except httpx.HTTPError:
            return []
        out: list[str] = []
        for group in data.get("relatedGroup", {}).get("conceptGroup", []) or []:
            for prop in group.get("conceptProperties") or []:
                cui = str(prop.get("rxcui", "")).strip()
                if cui:
                    out.append(cui)
        return out

    async def atc_class(self, rxcui: str) -> dict[str, str] | None:
        """Look up the ATC class for an rxcui via RxClass. Returns
        {atcId, className} of the most specific ATC level, or None."""
        try:
            data = await self._get(
                "/REST/rxclass/class/byRxcui.json",
                {"rxcui": rxcui, "relaSource": "ATC", "relas": "has_ingredient"},
            )
        except httpx.HTTPError:
            return None
        infos = (
            data.get("rxclassDrugInfoList", {}).get("rxclassDrugInfo", []) if data else []
        )
        best: dict[str, str] | None = None
        for info in infos:
            concept = info.get("rxclassMinConceptItem", {})
            class_id = concept.get("classId", "")
            class_name = concept.get("className", "")
            if not class_id:
                continue
            # Prefer the most specific (longest) ATC code.
            if best is None or len(class_id) > len(best["atcId"]):
                best = {"atcId": class_id, "className": class_name}
        return best

    async def name_for_rxcui(self, rxcui: str) -> str | None:
        """Best-effort display name for an rxcui (used to label graph nodes)."""
        try:
            data = await self._get(f"/REST/rxcui/{rxcui}/property.json", {"propName": "RxNorm Name"})
        except httpx.HTTPError:
            return None
        props = data.get("propConceptGroup", {}).get("propConcept", []) or []
        if props:
            return props[0].get("propValue")
        return None


async def healthcheck() -> bool:
    """Lightweight reachability probe for /health."""
    try:
        client = RxNormClient(timeout=4.0)
        await client._get("/REST/version.json")
        return True
    except Exception:
        return False
