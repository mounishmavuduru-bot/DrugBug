"""Mechanistic overlay rule engine (PRD §10.2).

A real, self-contained rule engine over the bundled CYP/QT/serotonergic table.
Works with ZERO trained weights — it flags drug *sets* that share a metabolic
pathway, additively prolong QT, or stack serotonergic load as cascade candidates
even when statistical (GNN/FAERS) signal is sparse, improving recall on
rare-but-known cascades.

Output cascades use the client's `CascadeFinding` shape with `source:
"mechanistic"`:
    {drugs, risk, dominantMechanism, explanation, source}

`risk` is a deterministic 0..1 score derived from rule strength and set size —
it is explicitly rule-based, never an invented model probability. The GNN layer,
when available, contributes separate `source: "model"` cascades.
"""

from __future__ import annotations

from dataclasses import dataclass
from itertools import combinations
from typing import Any

from app.models.cascade_gnn.mechanistic_table import (
    CYP_ROLES,
    QT_RISK,
    SEROTONERGIC,
    normalize_name,
)

_STRENGTH_W = {"strong": 1.0, "moderate": 0.6, "weak": 0.3}
_QT_W = {"known": 1.0, "possible": 0.6, "conditional": 0.4}


@dataclass
class DrugRef:
    """A drug as seen by the overlay: a display label + a normalized key."""

    label: str
    key: str


def make_refs(drugs: list[dict[str, Any]]) -> list[DrugRef]:
    """Build DrugRefs from {name|generic_name|label} dicts."""
    refs: list[DrugRef] = []
    for d in drugs:
        label = d.get("label") or d.get("name") or d.get("generic_name") or d.get("generic") or ""
        base = d.get("generic_name") or d.get("generic") or d.get("name") or label
        refs.append(DrugRef(label=label, key=normalize_name(base)))
    return refs


def detect_cascades(drugs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Run all three mechanistic detectors and return cascade findings."""
    refs = make_refs(drugs)
    cascades: list[dict[str, Any]] = []
    cascades.extend(_cyp_cascades(refs))
    cascades.extend(_qt_cascades(refs))
    cascades.extend(_serotonergic_cascades(refs))
    # Sort highest-risk first; cap to a sensible number.
    cascades.sort(key=lambda c: c["risk"], reverse=True)
    return cascades


# ----------------------------------------------------------------------------
# 1. Shared CYP pathway
# ----------------------------------------------------------------------------
def _cyp_cascades(refs: list[DrugRef]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    # Group by enzyme: which drugs are substrates, which inhibit/induce it.
    by_enzyme: dict[str, dict[str, list[tuple[DrugRef, str]]]] = {}
    for ref in refs:
        for entry in CYP_ROLES.get(ref.key, []):
            enzyme = entry["enzyme"]
            role = entry["role"]
            strength = entry.get("strength", "moderate")
            slot = by_enzyme.setdefault(enzyme, {"substrate": [], "inhibitor": [], "inducer": []})
            slot.setdefault(role, []).append((ref, strength))

    for enzyme, roles in by_enzyme.items():
        substrates = roles.get("substrate", [])
        inhibitors = roles.get("inhibitor", [])
        inducers = roles.get("inducer", [])
        modulators = inhibitors + inducers
        # A cascade candidate requires at least one substrate AND a modulator
        # (inhibitor raises substrate exposure; inducer lowers efficacy), or
        # multiple competing substrates of the same enzyme.
        if substrates and modulators:
            drugs_involved = _unique_labels([r for r, _ in substrates + modulators])
            if len(drugs_involved) < 2:
                continue
            sub_w = max((_STRENGTH_W.get(s, 0.6) for _, s in substrates), default=0.6)
            mod_w = max((_STRENGTH_W.get(s, 0.6) for _, s in modulators), default=0.6)
            risk = _clamp(0.4 + 0.45 * sub_w * mod_w)
            direction = "inhibitor" if inhibitors else "inducer"
            effect = (
                "raising substrate exposure (toxicity risk)"
                if inhibitors
                else "lowering substrate exposure (efficacy loss)"
            )
            out.append(
                _finding(
                    drugs_involved,
                    risk,
                    f"Shared {enzyme} metabolism",
                    f"{enzyme} {direction} co-administered with {enzyme} substrate(s), "
                    f"{effect}. Multiple agents compete on the same hepatic pathway.",
                )
            )
        elif len(substrates) >= 3:
            drugs_involved = _unique_labels([r for r, _ in substrates])
            risk = _clamp(0.35 + 0.05 * len(substrates))
            out.append(
                _finding(
                    drugs_involved,
                    risk,
                    f"Shared {enzyme} metabolism",
                    f"Three or more {enzyme} substrates compete for the same enzyme, "
                    "which can alter clearance of each.",
                )
            )
    return out


# ----------------------------------------------------------------------------
# 2. Additive QT prolongation
# ----------------------------------------------------------------------------
def _qt_cascades(refs: list[DrugRef]) -> list[dict[str, Any]]:
    qt_drugs = [(r, QT_RISK[r.key]) for r in refs if r.key in QT_RISK]
    if len(qt_drugs) < 2:
        return []
    labels = _unique_labels([r for r, _ in qt_drugs])
    if len(labels) < 2:
        return []
    weight = sum(_QT_W.get(level, 0.4) for _, level in qt_drugs)
    known = sum(1 for _, level in qt_drugs if level == "known")
    risk = _clamp(0.45 + 0.12 * weight + 0.08 * known)
    levels = ", ".join(sorted({level for _, level in qt_drugs}))
    return [
        _finding(
            labels,
            risk,
            "Additive QT prolongation",
            f"{len(labels)} agents with QT-prolonging potential ({levels} TdP risk) "
            "taken together additively increase the risk of QT prolongation and "
            "torsades de pointes.",
        )
    ]


# ----------------------------------------------------------------------------
# 3. Serotonergic load
# ----------------------------------------------------------------------------
def _serotonergic_cascades(refs: list[DrugRef]) -> list[dict[str, Any]]:
    sero = [(r, SEROTONERGIC[r.key]) for r in refs if r.key in SEROTONERGIC]
    classes = {cls for _, cls in sero}
    labels = _unique_labels([r for r, _ in sero])
    if len(labels) < 2:
        return []
    # MAOI + any other serotonergic agent is the highest-risk combination.
    has_maoi = "MAOI" in classes
    base = 0.5 + 0.1 * len(labels)
    if has_maoi and len(classes) >= 2:
        base += 0.25
    risk = _clamp(base)
    class_list = ", ".join(sorted(classes))
    extra = " An MAOI combined with another serotonergic agent is high-risk." if has_maoi else ""
    return [
        _finding(
            labels,
            risk,
            "Serotonergic load",
            f"{len(labels)} serotonergic agents ({class_list}) stack serotonergic "
            f"activity, increasing the risk of serotonin syndrome.{extra}",
        )
    ]


# ----------------------------------------------------------------------------
# helpers
# ----------------------------------------------------------------------------
def _finding(drugs: list[str], risk: float, mechanism: str, explanation: str) -> dict[str, Any]:
    return {
        "drugs": drugs,
        "risk": round(risk, 3),
        "dominantMechanism": mechanism,
        "explanation": explanation,
        "source": "mechanistic",
    }


def _unique_labels(refs: list[DrugRef]) -> list[str]:
    seen: dict[str, None] = {}
    for r in refs:
        if r.label and r.label not in seen:
            seen[r.label] = None
    return list(seen.keys())


def _clamp(x: float) -> float:
    return max(0.0, min(1.0, x))


def overlay_pairwise(refs_a: DrugRef, refs_b: DrugRef) -> list[dict[str, Any]]:
    """Pairwise mechanistic flags between exactly two drugs (used to enrich the
    KB pairwise list when no KB row exists). Returns pair findings, not cascades.
    """
    # Reuse the cascade detectors on the 2-element set and downcast to pairs.
    cascades = detect_cascades(
        [{"label": refs_a.label, "generic_name": refs_a.key},
         {"label": refs_b.label, "generic_name": refs_b.key}]
    )
    pairs: list[dict[str, Any]] = []
    for c in cascades:
        if len(c["drugs"]) == 2:
            sev = "contraindicated" if c["risk"] >= 0.8 else "caution" if c["risk"] >= 0.55 else "monitor"
            pairs.append(
                {
                    "drugA": c["drugs"][0],
                    "drugB": c["drugs"][1],
                    "severity": sev,
                    "mechanism": c["dominantMechanism"],
                    "management": "Discuss with prescriber or pharmacist.",
                    "source": "model",
                    "confidence": c["risk"],
                }
            )
    return pairs
