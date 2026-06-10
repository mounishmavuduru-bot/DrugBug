"""Ingest DDInter 2.0 pairwise interactions into Postgres (PRD §13).

DDInter 2.0 (http://ddinter2.scbdd.com/) publishes downloadable CSVs of
drug-drug interactions with severity and mechanism/management text. This script
loads those CSVs idempotently and version-pins the release.

LICENSE NOTE (PRD §13/§21): DDInter is free for academic/research use; commercial
terms must be cleared (or substituted with a fully-open equivalent) before
commercial launch.

Usage:
    python etl/ingest_ddinter.py --csv path/to/ddinter_downloads_code_*.csv [--version 2.0]

Expected CSV columns (DDInter export; column names are matched
case-insensitively): DDInterID, Drug_A, Drug_B, Level (severity), and where
present Mechanism / Management. Missing optional columns are tolerated.
"""

from __future__ import annotations

import argparse
import csv
import sys
from typing import Any

from etl.common import connect, ensure_schema, record_version, upsert_many

_SEVERITY_NORMALIZE = {
    "major": "major",
    "moderate": "moderate",
    "minor": "minor",
    "contraindicated": "contraindicated",
    "unknown": "minor",
}


def _col(row: dict[str, str], *names: str) -> str | None:
    lower = {k.lower(): v for k, v in row.items()}
    for n in names:
        if n.lower() in lower and lower[n.lower()]:
            return lower[n.lower()].strip()
    return None


def parse_csv(path: str) -> list[tuple[Any, ...]]:
    rows: list[tuple[Any, ...]] = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            drug_a = _col(row, "Drug_A", "DrugA", "drug_a")
            drug_b = _col(row, "Drug_B", "DrugB", "drug_b")
            if not drug_a or not drug_b:
                continue
            severity = (_col(row, "Level", "Severity") or "minor").lower()
            severity = _SEVERITY_NORMALIZE.get(severity, "minor")
            ddinter_id = _col(row, "DDInterID", "DDInter_ID", "id")
            mechanism = _col(row, "Mechanism", "mechanism") or ""
            management = _col(row, "Management", "management") or ""
            rows.append((ddinter_id, drug_a, drug_b, severity, mechanism, management, "ddinter-2.0"))
    return rows


def main() -> int:
    ap = argparse.ArgumentParser(description="Ingest DDInter 2.0 interactions")
    ap.add_argument("--csv", action="append", required=True, help="DDInter CSV path (repeatable)")
    ap.add_argument("--version", default="2.0")
    args = ap.parse_args()

    all_rows: list[tuple[Any, ...]] = []
    for path in args.csv:
        all_rows.extend(parse_csv(path))

    conn = connect()
    try:
        ensure_schema(conn)
        n = upsert_many(
            conn,
            "ddinter_interactions",
            ["ddinter_id", "drug_a_name", "drug_b_name", "severity", "mechanism", "management", "source"],
            all_rows,
            conflict_cols=["drug_a_name", "drug_b_name"],
        )
        record_version(conn, "ddinter", args.version, "http://ddinter2.scbdd.com/")
        print(f"ingested {n} DDInter interactions (version {args.version})")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
