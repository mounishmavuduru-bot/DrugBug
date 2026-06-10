"""CascadeMap engine (PRD §10.2, contract §interactions).

Combines the three layers into the client's `InteractionReport` shape:
  - KB layer (always-on): DDInter pairwise interactions from Postgres — every
    common pair gets an authoritative citable explanation (source: "kb").
  - GNN layer: model-predicted pairwise edges + cascades (source: "model"),
    when trained weights are present. Labeled distinctly, with confidence.
  - Mechanistic overlay: deterministic CYP/QT/serotonergic cascades
    (source: "mechanistic") — real and useful with zero trained weights.

Output:
  pairs:    [{drugA, drugB, severity, mechanism, management, source, confidence?}]
  cascades: [{drugs, risk, dominantMechanism, explanation, source}]
  hasMajor: bool   # any contraindicated/major pair OR high-risk cascade
  modelVersion, kbVersion

Severity is normalized to the client vocabulary: monitor | caution | contraindicated.
"""

from __future__ import annotations

from typing import Any

from app.config import get_settings
from app.integrations.rxnorm import RxNormClient
from app.kb.postgres import get_kb
from app.models.cascade_gnn.loader import get_cascade_server
from app.models.cascade_gnn.overlay import detect_cascades

# DDInter severity strings -> client severity vocabulary.
_SEVERITY_MAP = {
    "major": "contraindicated",
    "contraindicated": "contraindicated",
    "severe": "contraindicated",
    "moderate": "caution",
    "caution": "caution",
    "minor": "monitor",
    "monitor": "monitor",
    "mild": "monitor",
}

_MAJOR_RISK_THRESHOLD = 0.8


def normalize_severity(raw: str | None) -> str:
    return _SEVERITY_MAP.get((raw or "").strip().lower(), "monitor")


async def resolve_drugs_from_rxcuis(rxcuis: list[str]) -> list[dict[str, Any]]:
    """Resolve rxcuis to {rxcui, name, generic_name} via RxNorm (real lookup)."""
    client = RxNormClient()
    out: list[dict[str, Any]] = []
    for rxcui in rxcuis:
        rxcui = str(rxcui).strip()
        if not rxcui:
            continue
        name = await client.name_for_rxcui(rxcui)
        generic = await client._best_generic(rxcui, fallback=name or rxcui)
        out.append(
            {"rxcui": rxcui, "name": name or generic or rxcui, "generic_name": generic, "label": name or generic or rxcui}
        )
    return out


def drugs_from_medication_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Map SpacetimeDB medication rows to the engine's drug dicts."""
    out: list[dict[str, Any]] = []
    for r in rows:
        name = r.get("name") or ""
        generic = r.get("generic_name") or name
        rxcui = r.get("rxnorm_code") or ""
        out.append(
            {
                "rxcui": str(rxcui),
                "name": name,
                "generic_name": generic,
                "label": name or generic,
                "med_id": r.get("med_id"),
                "ndc": r.get("ndc"),
            }
        )
    return out


async def compute_report(drugs: list[dict[str, Any]]) -> dict[str, Any]:
    """Run KB + GNN + overlay for a resolved drug set and assemble the report."""
    settings = get_settings()
    kb = get_kb()
    gnn = get_cascade_server()

    pairs: list[dict[str, Any]] = []
    seen_pairs: set[tuple[str, str]] = set()

    # --- KB layer (authoritative pairwise) ---
    ingredient_keys = _ingredient_keys(drugs)
    kb_rows = await kb.pairwise_interactions(ingredient_keys)
    label_for = _label_lookup(drugs)
    for row in kb_rows:
        a = label_for(row.get("drug_a_name", ""))
        b = label_for(row.get("drug_b_name", ""))
        key = _pair_key(a, b)
        if key in seen_pairs:
            continue
        seen_pairs.add(key)
        pairs.append(
            {
                "drugA": a,
                "drugB": b,
                "severity": normalize_severity(row.get("severity")),
                "mechanism": row.get("mechanism") or "",
                "management": row.get("management") or "Discuss with your pharmacist.",
                "source": "kb",
                "confidence": None,
            }
        )

    cascades: list[dict[str, Any]] = []

    # --- GNN layer (model-predicted) ---
    gnn_result = gnn.predict(drugs)
    if gnn_result.get("available"):
        for p in gnn_result.get("pairs", []):
            key = _pair_key(p["drugA"], p["drugB"])
            if key in seen_pairs:
                continue  # KB fact wins over model prediction for the same pair
            seen_pairs.add(key)
            pairs.append(p)
        cascades.extend(gnn_result.get("cascades", []))

    # --- Mechanistic overlay (always-on, deterministic) ---
    overlay = detect_cascades(drugs)
    cascades.extend(overlay)
    cascades = _dedupe_cascades(cascades)
    cascades.sort(key=lambda c: c.get("risk", 0.0), reverse=True)

    has_major = any(p["severity"] == "contraindicated" for p in pairs) or any(
        c.get("risk", 0.0) >= _MAJOR_RISK_THRESHOLD for c in cascades
    )

    kb_version = await kb.kb_version() if kb.configured else settings.kb_version

    return {
        "pairs": pairs,
        "cascades": cascades,
        "hasMajor": has_major,
        "modelVersion": settings.model_version,
        "kbVersion": kb_version,
        "gnn": gnn.status(),
    }


def _ingredient_keys(drugs: list[dict[str, Any]]) -> list[str]:
    keys: set[str] = set()
    for d in drugs:
        for v in (d.get("generic_name"), d.get("name")):
            if v:
                keys.add(str(v))
    return list(keys)


def _label_lookup(drugs: list[dict[str, Any]]):
    by_name: dict[str, str] = {}
    for d in drugs:
        label = d.get("label") or d.get("name") or d.get("generic_name") or ""
        for v in (d.get("generic_name"), d.get("name")):
            if v:
                by_name[str(v).lower()] = label

    def lookup(name: str) -> str:
        return by_name.get((name or "").lower(), name)

    return lookup


def _pair_key(a: str, b: str) -> tuple[str, str]:
    return tuple(sorted([(a or "").lower(), (b or "").lower()]))  # type: ignore[return-value]


def _dedupe_cascades(cascades: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple] = set()
    out: list[dict[str, Any]] = []
    for c in cascades:
        key = (tuple(sorted(d.lower() for d in c.get("drugs", []))), c.get("dominantMechanism", ""))
        if key in seen:
            continue
        seen.add(key)
        out.append(c)
    return out
