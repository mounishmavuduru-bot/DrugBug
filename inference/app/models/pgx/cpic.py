"""CPIC phenotype → medication guidance mapping (PRD §10.4).

Maps a user's PharmCAT-derived gene phenotypes against their active medications
to produce per-medication CPIC flags. The authoritative guidance text comes from
the `cpic_guidelines` Postgres table (loaded by etl/ingest_cpic.py from CPIC /
PharmGKB). A small bundled fallback covers the highest-impact gene-drug pairs so
the flag surface is useful even before the CPIC ETL has run — every fallback
entry is a real, citable CPIC recommendation.

Output flag matches the client's PgxFlag shape:
  {gene, phenotype, medication, guidance, cpicLevel?}
"""

from __future__ import annotations

from typing import Any

from app.kb.postgres import get_kb
from app.models.cascade_gnn.mechanistic_table import normalize_name

# Gene -> set of drugs with CPIC guidance (used to know which meds to flag).
# Curated from CPIC guideline scope (cpicpgx.org). Authoritative text comes from
# the DB; this map drives which (gene, drug) pairs are even relevant.
GENE_DRUGS: dict[str, set[str]] = {
    "CYP2D6": {"codeine", "tramadol", "oxycodone", "hydrocodone", "tamoxifen",
               "atomoxetine", "fluvoxamine", "paroxetine", "fluoxetine",
               "nortriptyline", "amitriptyline", "metoprolol", "ondansetron"},
    "CYP2C19": {"clopidogrel", "voriconazole", "citalopram", "escitalopram",
                "sertraline", "amitriptyline", "omeprazole", "pantoprazole",
                "lansoprazole", "dexlansoprazole"},
    "CYP2C9": {"warfarin", "phenytoin", "celecoxib", "flurbiprofen", "ibuprofen",
               "meloxicam", "piroxicam"},
    "VKORC1": {"warfarin"},
    "SLCO1B1": {"simvastatin", "atorvastatin", "rosuvastatin", "pravastatin"},
    "TPMT": {"azathioprine", "mercaptopurine", "thioguanine"},
    "NUDT15": {"azathioprine", "mercaptopurine", "thioguanine"},
    "DPYD": {"fluorouracil", "capecitabine", "tegafur"},
    "CYP3A5": {"tacrolimus"},
    "UGT1A1": {"irinotecan", "atazanavir"},
    "CYP2B6": {"efavirenz"},
    "HLA-B": {"abacavir", "allopurinol", "carbamazepine", "phenytoin", "oxcarbazepine"},
    "G6PD": {"rasburicase", "primaquine", "tafenoquine"},
    "IFNL3": {"peginterferon"},
}

# Bundled fallback guidance for the highest-impact, frequently-cited pairs.
# (gene, phenotype-substring) -> {drug -> (guidance, cpic_level)}.
FALLBACK_GUIDANCE: dict[tuple[str, str], dict[str, tuple[str, str]]] = {
    ("CYP2D6", "poor metabolizer"): {
        "codeine": (
            "Codeine — CYP2D6 poor metabolizer: codeine is unlikely to relieve pain "
            "(reduced conversion to morphine). Discuss an alternative analgesic with "
            "your prescriber.",
            "A",
        ),
        "tramadol": (
            "Tramadol — CYP2D6 poor metabolizer: reduced analgesic effect likely; "
            "consider an alternative not metabolized by CYP2D6.",
            "A",
        ),
    },
    ("CYP2D6", "ultrarapid"): {
        "codeine": (
            "Codeine — CYP2D6 ultrarapid metabolizer: risk of morphine toxicity from "
            "increased conversion. Avoid codeine; choose an alternative analgesic.",
            "A",
        ),
        "tramadol": (
            "Tramadol — CYP2D6 ultrarapid metabolizer: increased risk of toxicity; "
            "avoid and choose an alternative.",
            "A",
        ),
    },
    ("CYP2C19", "poor metabolizer"): {
        "clopidogrel": (
            "Clopidogrel — CYP2C19 poor metabolizer: reduced active-metabolite "
            "formation and antiplatelet effect; an alternative antiplatelet (e.g. "
            "prasugrel/ticagrelor) may be preferred. Discuss with your prescriber.",
            "A",
        ),
    },
    ("SLCO1B1", "decreased function"): {
        "simvastatin": (
            "Simvastatin — SLCO1B1 decreased function: increased myopathy risk at "
            "higher doses; a lower dose or an alternative statin may be preferred.",
            "A",
        ),
    },
    ("SLCO1B1", "poor function"): {
        "simvastatin": (
            "Simvastatin — SLCO1B1 poor function: substantially increased myopathy "
            "risk; prescriber may select an alternative statin or low dose.",
            "A",
        ),
    },
    ("TPMT", "poor metabolizer"): {
        "azathioprine": (
            "Azathioprine — TPMT poor metabolizer: high risk of severe myelosuppression; "
            "drastic dose reduction or alternative therapy is recommended.",
            "A",
        ),
        "mercaptopurine": (
            "Mercaptopurine — TPMT poor metabolizer: high myelosuppression risk; "
            "substantial dose reduction recommended.",
            "A",
        ),
    },
    ("DPYD", "poor metabolizer"): {
        "fluorouracil": (
            "Fluorouracil — DPYD poor metabolizer: high risk of severe/fatal toxicity; "
            "avoid or use a strongly reduced dose under specialist guidance.",
            "A",
        ),
        "capecitabine": (
            "Capecitabine — DPYD poor metabolizer: high toxicity risk; avoid or "
            "strongly reduce dose under specialist guidance.",
            "A",
        ),
    },
}


async def map_flags(
    phenotypes: dict[str, str], active_medications: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Produce PgxFlags for the user's active meds given their gene phenotypes."""
    kb = get_kb()
    med_keys = {normalize_name(m.get("generic_name") or m.get("name") or ""): (m.get("name") or m.get("generic_name"))
                for m in active_medications}

    flags: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()

    for gene, phenotype in phenotypes.items():
        gene_u = gene.upper()
        relevant_drugs = GENE_DRUGS.get(gene_u, set())
        for med_key, med_label in med_keys.items():
            if med_key not in relevant_drugs:
                continue
            key = (gene_u, med_key)
            if key in seen:
                continue

            guidance, level = await _guidance(kb, gene_u, phenotype, med_key)
            if guidance is None:
                # Relevant gene-drug pair but phenotype not actionable / no text.
                continue
            seen.add(key)
            flags.append(
                {
                    "gene": gene_u,
                    "phenotype": phenotype,
                    "medication": med_label or med_key,
                    "guidance": guidance,
                    "cpicLevel": level,
                }
            )
    return flags


async def _guidance(kb, gene: str, phenotype: str, drug_key: str) -> tuple[str | None, str | None]:
    # 1) Authoritative DB guidance.
    if kb.configured:
        rows = await kb.cpic_guidance(gene, phenotype)
        for row in rows:
            if normalize_name(row.get("drug", "")) == drug_key:
                return row.get("guidance"), row.get("cpic_level")
    # 2) Bundled fallback (matched on phenotype substring).
    pl = (phenotype or "").lower()
    for (g, pheno_sub), drugs in FALLBACK_GUIDANCE.items():
        if g == gene and pheno_sub in pl and drug_key in drugs:
            text, level = drugs[drug_key]
            return text, level
    return None, None
