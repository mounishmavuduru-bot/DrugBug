"""Ingest the pill reference gallery into Postgres (PRD §13).

Loads physical-characteristic + imprint reference data for the DrugScan
attribute/imprint/NN layers. Sources:
  - NLM C3PI RxImage reference set (U.S. government, public)
  - ePillID benchmark metadata (open, research)
  - FDA DailyMed physical-characteristic data (public)

This script ingests a normalized CSV (one row per NDC) with optional precomputed
embeddings (JSON array) produced by training/train_pill_embedder.py. Idempotent
upsert by NDC; version-pinned.

Usage:
    python etl/ingest_pill_reference.py --csv pill_reference.csv \
        [--embeddings embeddings.jsonl] [--version c3pi-2023]

CSV columns (case-insensitive): ndc, name, generic_name, imprint, shape, color,
scoring, size_mm, source. The optional --embeddings JSONL has {ndc, embedding}.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from typing import Any

from etl.common import connect, ensure_schema, record_version, upsert_many


def _col(row: dict[str, str], *names: str) -> str | None:
    lower = {k.lower(): v for k, v in row.items()}
    for n in names:
        if n.lower() in lower and lower[n.lower()] != "":
            return lower[n.lower()].strip()
    return None


def _to_float(v: str | None):
    try:
        return float(v) if v not in (None, "") else None
    except ValueError:
        return None


def load_embeddings(path: str | None) -> dict[str, str]:
    if not path:
        return {}
    out: dict[str, str] = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            ndc = str(obj.get("ndc", ""))
            emb = obj.get("embedding")
            if ndc and isinstance(emb, list):
                out[ndc] = json.dumps(emb)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="Ingest pill reference gallery")
    ap.add_argument("--csv", required=True)
    ap.add_argument("--embeddings", default=None, help="optional JSONL of {ndc, embedding}")
    ap.add_argument("--version", default="c3pi-2023")
    args = ap.parse_args()

    embeddings = load_embeddings(args.embeddings)

    rows: list[tuple[Any, ...]] = []
    with open(args.csv, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            ndc = _col(row, "ndc")
            if not ndc:
                continue
            rows.append(
                (
                    ndc,
                    _col(row, "name"),
                    _col(row, "generic_name", "genericname"),
                    _col(row, "imprint"),
                    _col(row, "shape"),
                    _col(row, "color"),
                    _col(row, "scoring"),
                    _to_float(_col(row, "size_mm", "size")),
                    _col(row, "source") or args.version,
                    embeddings.get(ndc),
                )
            )

    conn = connect()
    try:
        ensure_schema(conn)
        n = upsert_many(
            conn,
            "pill_reference",
            ["ndc", "name", "generic_name", "imprint", "shape", "color", "scoring", "size_mm", "source", "embedding"],
            rows,
            conflict_cols=["ndc"],
        )
        record_version(conn, "pill_reference", args.version, "https://www.nlm.nih.gov/databases/download/pill_image.html")
        print(f"ingested {n} pill reference rows (version {args.version}); "
              f"{sum(1 for r in rows if r[-1])} with embeddings")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
