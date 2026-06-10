"""Shared ETL helpers + schema (PRD §13).

Each ETL script is real and idempotent and version-pins its dataset. psycopg is
a lightweight boot dep. The schema mirrors what app/kb/postgres.py reads.
"""

from __future__ import annotations

import os
from typing import Any

import psycopg

SCHEMA = """
CREATE TABLE IF NOT EXISTS kb_dataset_versions (
    dataset      TEXT NOT NULL,
    version      TEXT NOT NULL,
    source_url   TEXT,
    ingested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (dataset, version)
);

CREATE TABLE IF NOT EXISTS ddinter_interactions (
    ddinter_id   TEXT,
    drug_a_name  TEXT NOT NULL,
    drug_b_name  TEXT NOT NULL,
    severity     TEXT,
    mechanism    TEXT,
    management   TEXT,
    source       TEXT DEFAULT 'ddinter-2.0',
    PRIMARY KEY (drug_a_name, drug_b_name)
);
CREATE INDEX IF NOT EXISTS idx_ddinter_a ON ddinter_interactions (lower(drug_a_name));
CREATE INDEX IF NOT EXISTS idx_ddinter_b ON ddinter_interactions (lower(drug_b_name));

CREATE TABLE IF NOT EXISTS twosides_associations (
    drug_a_rxcui TEXT NOT NULL,
    drug_b_rxcui TEXT NOT NULL,
    side_effect  TEXT NOT NULL,
    prr          DOUBLE PRECISION,
    ror          DOUBLE PRECISION,
    PRIMARY KEY (drug_a_rxcui, drug_b_rxcui, side_effect)
);

CREATE TABLE IF NOT EXISTS rxnorm_atc_classes (
    ingredient_name TEXT PRIMARY KEY,
    rxcui           TEXT,
    atc_code        TEXT,
    atc_class       TEXT
);

CREATE TABLE IF NOT EXISTS pill_reference (
    ndc          TEXT PRIMARY KEY,
    name         TEXT,
    generic_name TEXT,
    imprint      TEXT,
    shape        TEXT,
    color        TEXT,
    scoring      TEXT,
    size_mm      DOUBLE PRECISION,
    source       TEXT,
    embedding    JSONB
);
CREATE INDEX IF NOT EXISTS idx_pill_imprint ON pill_reference (lower(imprint));
CREATE INDEX IF NOT EXISTS idx_pill_shape_color ON pill_reference (lower(shape), lower(color));

CREATE TABLE IF NOT EXISTS cpic_guidelines (
    gene       TEXT NOT NULL,
    phenotype  TEXT NOT NULL,
    drug       TEXT NOT NULL,
    guidance   TEXT,
    cpic_level TEXT,
    PRIMARY KEY (gene, phenotype, drug)
);
"""


def postgres_url() -> str:
    url = os.getenv("POSTGRES_URL")
    if not url:
        raise SystemExit("POSTGRES_URL is required to run ETL")
    return url


def connect() -> psycopg.Connection:
    return psycopg.connect(postgres_url())


def ensure_schema(conn: psycopg.Connection) -> None:
    with conn.cursor() as cur:
        cur.execute(SCHEMA)
    conn.commit()


def record_version(conn: psycopg.Connection, dataset: str, version: str, source_url: str | None = None) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO kb_dataset_versions (dataset, version, source_url) "
            "VALUES (%s, %s, %s) ON CONFLICT (dataset, version) "
            "DO UPDATE SET ingested_at = now(), source_url = EXCLUDED.source_url",
            (dataset, version, source_url),
        )
    conn.commit()


def upsert_many(
    conn: psycopg.Connection,
    table: str,
    columns: list[str],
    rows: list[tuple[Any, ...]],
    conflict_cols: list[str],
    update_cols: list[str] | None = None,
    batch: int = 1000,
) -> int:
    """Idempotent batched upsert via ON CONFLICT DO UPDATE."""
    if not rows:
        return 0
    cols = ", ".join(columns)
    placeholders = ", ".join(["%s"] * len(columns))
    conflict = ", ".join(conflict_cols)
    update_cols = update_cols or [c for c in columns if c not in conflict_cols]
    set_clause = ", ".join(f"{c} = EXCLUDED.{c}" for c in update_cols)
    sql = (
        f"INSERT INTO {table} ({cols}) VALUES ({placeholders}) "
        f"ON CONFLICT ({conflict}) DO UPDATE SET {set_clause}"
        if update_cols
        else f"INSERT INTO {table} ({cols}) VALUES ({placeholders}) "
        f"ON CONFLICT ({conflict}) DO NOTHING"
    )
    count = 0
    with conn.cursor() as cur:
        for i in range(0, len(rows), batch):
            chunk = rows[i : i + batch]
            cur.executemany(sql, chunk)
            count += len(chunk)
    conn.commit()
    return count
