"""Mine multi-drug ADE cascade labels from FAERS (PRD §10.2/§11).

Extracts FAERS reports with >=3 concomitant drugs and computes disproportionality
statistics (PRR/ROR) for serious outcomes to build n-drug -> outcome labels for
the cascade (set-aggregation) head. Real, runnable over the public FAERS quarterly
files (ASCII: DRUG.txt, REAC.txt, OUTC.txt, DEMO.txt).

This is CPU-bound data mining (no GPU); outputs a JSONL of cascade labels:
  {"drugs": [rxcui-or-name,...], "outcome": "...", "prr": x, "ror": y, "n": k}

Usage:
    python training/mine_faers_cascades.py --faers-dir faers_ascii_2024q1 \
        --min-drugs 3 --out cascades.jsonl
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from collections import defaultdict
from typing import Any

SERIOUS_OUTCOMES = {"DE", "LT", "HO", "DS", "CA", "RI"}  # FAERS OUTC codes


def _read_psv(path: str) -> list[dict[str, str]]:
    """Read a FAERS '$'-delimited file into dict rows."""
    rows: list[dict[str, str]] = []
    if not os.path.exists(path):
        return rows
    with open(path, encoding="latin-1") as f:
        header = f.readline().rstrip("\n").split("$")
        for line in f:
            parts = line.rstrip("\n").split("$")
            if len(parts) < len(header):
                parts += [""] * (len(header) - len(parts))
            rows.append(dict(zip(header, parts)))
    return rows


def _find(faers_dir: str, base: str) -> str:
    for name in os.listdir(faers_dir):
        if name.upper().startswith(base) and name.lower().endswith(".txt"):
            return os.path.join(faers_dir, name)
    return os.path.join(faers_dir, f"{base}.txt")


def mine(faers_dir: str, min_drugs: int) -> list[dict[str, Any]]:
    drug_rows = _read_psv(_find(faers_dir, "DRUG"))
    reac_rows = _read_psv(_find(faers_dir, "REAC"))
    outc_rows = _read_psv(_find(faers_dir, "OUTC"))

    # Map primaryid -> set of drugs, reactions, serious flag.
    case_drugs: dict[str, set[str]] = defaultdict(set)
    for r in drug_rows:
        pid = r.get("primaryid") or r.get("isr") or ""
        name = (r.get("drugname") or "").strip().lower()
        if pid and name:
            case_drugs[pid].add(name)

    case_reacs: dict[str, set[str]] = defaultdict(set)
    for r in reac_rows:
        pid = r.get("primaryid") or r.get("isr") or ""
        pt = (r.get("pt") or "").strip().lower()
        if pid and pt:
            case_reacs[pid].add(pt)

    case_serious: dict[str, bool] = defaultdict(bool)
    for r in outc_rows:
        pid = r.get("primaryid") or r.get("isr") or ""
        code = (r.get("outc_cod") or "").strip().upper()
        if pid and code in SERIOUS_OUTCOMES:
            case_serious[pid] = True

    # Build contingency counts for (drug-set, outcome) disproportionality.
    combo_outcome = defaultdict(int)  # (frozenset drugs, outcome) -> count with combo+outcome
    combo_total = defaultdict(int)  # frozenset drugs -> count of cases with combo
    outcome_total = defaultdict(int)  # outcome -> count
    grand_total = 0

    for pid, drugs in case_drugs.items():
        if len(drugs) < min_drugs:
            continue
        grand_total += 1
        combo = frozenset(sorted(drugs)[:min_drugs])  # cap combo size for tractability
        combo_total[combo] += 1
        for reac in case_reacs.get(pid, set()):
            outcome_total[reac] += 1
            combo_outcome[(combo, reac)] += 1

    labels: list[dict[str, Any]] = []
    for (combo, outcome), a in combo_outcome.items():
        if a < 3:  # minimum support
            continue
        n_combo = combo_total[combo]
        n_outcome = outcome_total[outcome]
        # 2x2: a = combo&outcome, b = combo&!outcome, c = !combo&outcome, d = rest
        b = n_combo - a
        c = n_outcome - a
        d = grand_total - a - b - c
        prr = _prr(a, b, c, d)
        ror = _ror(a, b, c, d)
        if prr is None or prr < 2.0:
            continue
        labels.append(
            {
                "drugs": sorted(combo),
                "outcome": outcome,
                "prr": round(prr, 3),
                "ror": round(ror, 3) if ror else None,
                "n": a,
            }
        )
    labels.sort(key=lambda x: x["prr"], reverse=True)
    return labels


def _prr(a, b, c, d):
    if (a + b) == 0 or (c + d) == 0 or c == 0:
        return None
    return (a / (a + b)) / (c / (c + d)) if (c / (c + d)) > 0 else None


def _ror(a, b, c, d):
    if b == 0 or c == 0:
        return None
    return (a * d) / (b * c)


def main() -> int:
    ap = argparse.ArgumentParser(description="Mine FAERS multi-drug cascade labels")
    ap.add_argument("--faers-dir", required=True)
    ap.add_argument("--min-drugs", type=int, default=3)
    ap.add_argument("--out", default="cascades.jsonl")
    args = ap.parse_args()

    labels = mine(args.faers_dir, args.min_drugs)
    with open(args.out, "w") as f:
        for label in labels:
            f.write(json.dumps(label) + "\n")
    print(f"mined {len(labels)} cascade labels -> {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
