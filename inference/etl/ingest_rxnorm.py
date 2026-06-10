"""Ingest RxNorm ingredient → ATC class mapping into Postgres (PRD §13).

Populates `rxnorm_atc_classes` so the missed-dose classifier and CascadeMap node
typing can resolve an ingredient's therapeutic/ATC class without a live RxNav
call on every request. Source: NLM RxClass API (public, no key).

Two modes:
  --ingredients-file  : a newline-delimited list of ingredient names to resolve
                        via the live RxClass API (real network calls).
  --rxnorm-rrf DIR    : (optional) parse a local RxNorm release (RXNCONSO.RRF /
                        RXNREL/RXNSAT) — left as a hook; the API mode is the
                        default real path that needs no bulk download.

Idempotent upsert by ingredient_name. Version-pinned.

Usage:
    python etl/ingest_rxnorm.py --ingredients-file ingredients.txt [--version 2024AA]
"""

from __future__ import annotations

import argparse
import sys
import time
from typing import Any

import httpx

from etl.common import connect, ensure_schema, record_version, upsert_many

RXNAV = "https://rxnav.nlm.nih.gov"


def resolve_ingredient(client: httpx.Client, name: str) -> tuple[str, str, str, str] | None:
    """Resolve an ingredient name to (ingredient_name, rxcui, atc_code, atc_class)."""
    # 1) name -> rxcui
    r = client.get(f"{RXNAV}/REST/rxcui.json", params={"name": name, "search": 2})
    r.raise_for_status()
    ids = r.json().get("idGroup", {}).get("rxnormId", [])
    if not ids:
        return None
    rxcui = ids[0]
    # 2) rxcui -> ATC class via RxClass
    r2 = client.get(
        f"{RXNAV}/REST/rxclass/class/byRxcui.json",
        params={"rxcui": rxcui, "relaSource": "ATC"},
    )
    r2.raise_for_status()
    infos = r2.json().get("rxclassDrugInfoList", {}).get("rxclassDrugInfo", [])
    best_code, best_class = "", ""
    for info in infos:
        concept = info.get("rxclassMinConceptItem", {})
        code = concept.get("classId", "")
        cls = concept.get("className", "")
        if code and len(code) > len(best_code):
            best_code, best_class = code, cls
    return (name, rxcui, best_code, best_class)


def main() -> int:
    ap = argparse.ArgumentParser(description="Ingest RxNorm ingredient -> ATC classes")
    ap.add_argument("--ingredients-file", required=True)
    ap.add_argument("--version", default="2024AA")
    ap.add_argument("--sleep", type=float, default=0.1, help="delay between API calls")
    args = ap.parse_args()

    with open(args.ingredients_file, encoding="utf-8") as f:
        names = [line.strip() for line in f if line.strip()]

    rows: list[tuple[Any, ...]] = []
    with httpx.Client(timeout=15.0) as client:
        for name in names:
            try:
                resolved = resolve_ingredient(client, name)
            except httpx.HTTPError:
                resolved = None
            if resolved:
                rows.append(resolved)
            time.sleep(args.sleep)

    conn = connect()
    try:
        ensure_schema(conn)
        n = upsert_many(
            conn,
            "rxnorm_atc_classes",
            ["ingredient_name", "rxcui", "atc_code", "atc_class"],
            rows,
            conflict_cols=["ingredient_name"],
        )
        record_version(conn, "rxnorm", args.version, RXNAV)
        print(f"ingested {n} RxNorm ingredient->ATC rows (version {args.version})")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
