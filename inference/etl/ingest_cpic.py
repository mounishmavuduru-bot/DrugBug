"""Ingest CPIC gene-phenotype-drug guidance into Postgres (PRD §13, §10.4).

Loads CPIC (Clinical Pharmacogenetics Implementation Consortium) guideline
recommendations keyed by (gene, phenotype, drug) so PharmacoFit can map a user's
PharmCAT phenotypes + active meds to actionable guidance.

Source: CPIC API (https://api.cpicpgx.org) — the public PostgREST endpoint
exposing the CPIC database — or a downloaded CPIC guideline export CSV. CPIC
guidelines are open; confirm PharmGKB data-use terms before commercial launch.

Usage:
    # From the live CPIC API (real network calls):
    python etl/ingest_cpic.py --from-api [--version 2024]
    # Or from a CSV export:
    python etl/ingest_cpic.py --csv cpic_recommendations.csv [--version 2024]

CSV columns (case-insensitive): gene, phenotype, drug, guidance, cpic_level.
"""

from __future__ import annotations

import argparse
import csv
import sys
from typing import Any

import httpx

from etl.common import connect, ensure_schema, record_version, upsert_many

CPIC_API = "https://api.cpicpgx.org/v1"


def _col(row: dict[str, str], *names: str) -> str | None:
    lower = {k.lower(): v for k, v in row.items()}
    for n in names:
        if n.lower() in lower and lower[n.lower()] != "":
            return lower[n.lower()].strip()
    return None


def from_csv(path: str) -> list[tuple[Any, ...]]:
    rows: list[tuple[Any, ...]] = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            gene = _col(row, "gene")
            phenotype = _col(row, "phenotype")
            drug = _col(row, "drug")
            if not (gene and phenotype and drug):
                continue
            rows.append(
                (
                    gene,
                    phenotype,
                    drug,
                    _col(row, "guidance", "recommendation", "drugrecommendation") or "",
                    _col(row, "cpic_level", "classification", "level") or "",
                )
            )
    return rows


def from_api() -> list[tuple[Any, ...]]:
    """Pull recommendations from the CPIC PostgREST API.

    The `recommendation` table joins drug, gene phenotypes (as a lookupkey JSON),
    and the recommendation text. We flatten gene->phenotype pairs into rows.
    """
    rows: list[tuple[Any, ...]] = []
    with httpx.Client(timeout=30.0) as client:
        resp = client.get(
            f"{CPIC_API}/recommendation",
            params={"select": "drugid,drug(name),lookupkey,drugrecommendation,classification"},
        )
        resp.raise_for_status()
        for rec in resp.json():
            drug_obj = rec.get("drug") or {}
            drug = drug_obj.get("name")
            guidance = rec.get("drugrecommendation") or ""
            level = rec.get("classification") or ""
            lookup = rec.get("lookupkey") or {}
            if not drug or not isinstance(lookup, dict):
                continue
            for gene, phenotype in lookup.items():
                if not phenotype:
                    continue
                rows.append((gene, str(phenotype), drug, guidance, level))
    return rows


def main() -> int:
    ap = argparse.ArgumentParser(description="Ingest CPIC guidance")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--csv")
    src.add_argument("--from-api", action="store_true")
    ap.add_argument("--version", default="2024")
    args = ap.parse_args()

    rows = from_csv(args.csv) if args.csv else from_api()

    conn = connect()
    try:
        ensure_schema(conn)
        n = upsert_many(
            conn,
            "cpic_guidelines",
            ["gene", "phenotype", "drug", "guidance", "cpic_level"],
            rows,
            conflict_cols=["gene", "phenotype", "drug"],
        )
        record_version(conn, "cpic", args.version, CPIC_API)
        print(f"ingested {n} CPIC guidance rows (version {args.version})")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
