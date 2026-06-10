"""Ingest TWOSIDES drug-drug-side-effect associations into Postgres (PRD §13).

TWOSIDES (Tatonetti lab, nsides.io) is a FAERS-derived database of two-drug
side-effect associations with disproportionality statistics (PRR/ROR). Used as
GNN training labels (drug-drug-SE edges) and for surfacing model context.

This loads the TWOSIDES TSV idempotently and version-pins it. Open license.

Usage:
    python etl/ingest_twosides.py --tsv TWOSIDES.csv [--version 0.1]

The TWOSIDES export is large; rows are streamed and upserted in batches. Column
matching is case-insensitive over the published header.
"""

from __future__ import annotations

import argparse
import csv
import sys
from typing import Any

from etl.common import connect, ensure_schema, record_version, upsert_many


def _col(row: dict[str, str], *names: str) -> str | None:
    lower = {k.lower(): v for k, v in row.items()}
    for n in names:
        if n.lower() in lower and lower[n.lower()] != "":
            return lower[n.lower()]
    return None


def _to_float(v: str | None) -> float | None:
    try:
        return float(v) if v not in (None, "") else None
    except ValueError:
        return None


def stream_rows(path: str):
    # TWOSIDES files are tab- or comma-separated depending on the release.
    with open(path, newline="", encoding="utf-8") as f:
        sample = f.read(4096)
        f.seek(0)
        delimiter = "\t" if "\t" in sample else ","
        reader = csv.DictReader(f, delimiter=delimiter)
        for row in reader:
            a = _col(row, "drug_1_rxnorm_id", "drug_1_rxcui", "drug_a_rxcui", "drug_1_concept_id")
            b = _col(row, "drug_2_rxnorm_id", "drug_2_rxcui", "drug_b_rxcui", "drug_2_concept_id")
            se = _col(row, "condition_meddra_id", "event", "side_effect", "condition_concept_name")
            if not a or not b or not se:
                continue
            prr = _to_float(_col(row, "PRR", "prr"))
            ror = _to_float(_col(row, "ROR", "ror"))
            yield (str(a), str(b), str(se), prr, ror)


def main() -> int:
    ap = argparse.ArgumentParser(description="Ingest TWOSIDES associations")
    ap.add_argument("--tsv", required=True)
    ap.add_argument("--version", default="0.1")
    ap.add_argument("--batch", type=int, default=5000)
    args = ap.parse_args()

    conn = connect()
    try:
        ensure_schema(conn)
        buffer: list[tuple[Any, ...]] = []
        total = 0
        for row in stream_rows(args.tsv):
            buffer.append(row)
            if len(buffer) >= args.batch:
                total += upsert_many(
                    conn,
                    "twosides_associations",
                    ["drug_a_rxcui", "drug_b_rxcui", "side_effect", "prr", "ror"],
                    buffer,
                    conflict_cols=["drug_a_rxcui", "drug_b_rxcui", "side_effect"],
                )
                buffer = []
        if buffer:
            total += upsert_many(
                conn,
                "twosides_associations",
                ["drug_a_rxcui", "drug_b_rxcui", "side_effect", "prr", "ror"],
                buffer,
                conflict_cols=["drug_a_rxcui", "drug_b_rxcui", "side_effect"],
            )
        record_version(conn, "twosides", args.version, "https://nsides.io/")
        print(f"ingested {total} TWOSIDES associations (version {args.version})")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
