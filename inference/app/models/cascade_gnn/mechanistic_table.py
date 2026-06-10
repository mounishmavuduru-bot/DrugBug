"""Bundled mechanistic reference table for the CascadeMap overlay (PRD §10.2).

Self-contained, zero-dependency (stdlib only) reference data covering three
well-established polypharmacy cascade mechanisms:

  1. Shared CYP450 metabolic pathways (substrate / inhibitor / inducer roles)
  2. Additive QT-interval prolongation
  3. Serotonergic load (serotonin syndrome risk)

This is curated from public, citable clinical-pharmacology references
(FDA labeling, the Flockhart/Indiana CYP450 Drug Interaction Table, CredibleMeds
QTdrugs categories, and standard serotonin-syndrome drug lists). It is a
screening aid, NOT an exhaustive database, and it powers the deterministic
overlay that works with zero trained GNN weights. Keys are normalized
(lowercase) generic ingredient names.

Every entry is a real, known pharmacologic property; the overlay never invents
probabilities — it reports rule-based cascade *candidates* with an explicit
mechanism and a deterministic severity.
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# CYP450 roles. role ∈ {"substrate", "inhibitor", "inducer"}; strength is a
# qualitative magnitude used to weight the overlay ("strong" | "moderate" | "weak").
# Source: Flockhart Table (Indiana Univ.) + FDA labeling.
# ---------------------------------------------------------------------------
CYP_ROLES: dict[str, list[dict[str, str]]] = {
    # CYP3A4
    "clarithromycin": [{"enzyme": "CYP3A4", "role": "inhibitor", "strength": "strong"}],
    "erythromycin": [{"enzyme": "CYP3A4", "role": "inhibitor", "strength": "moderate"}],
    "ketoconazole": [{"enzyme": "CYP3A4", "role": "inhibitor", "strength": "strong"}],
    "itraconazole": [{"enzyme": "CYP3A4", "role": "inhibitor", "strength": "strong"}],
    "fluconazole": [
        {"enzyme": "CYP3A4", "role": "inhibitor", "strength": "moderate"},
        {"enzyme": "CYP2C9", "role": "inhibitor", "strength": "strong"},
        {"enzyme": "CYP2C19", "role": "inhibitor", "strength": "moderate"},
    ],
    "ritonavir": [{"enzyme": "CYP3A4", "role": "inhibitor", "strength": "strong"}],
    "diltiazem": [{"enzyme": "CYP3A4", "role": "inhibitor", "strength": "moderate"}],
    "verapamil": [{"enzyme": "CYP3A4", "role": "inhibitor", "strength": "moderate"}],
    "grapefruit": [{"enzyme": "CYP3A4", "role": "inhibitor", "strength": "moderate"}],
    "rifampin": [
        {"enzyme": "CYP3A4", "role": "inducer", "strength": "strong"},
        {"enzyme": "CYP2C9", "role": "inducer", "strength": "moderate"},
    ],
    "carbamazepine": [
        {"enzyme": "CYP3A4", "role": "inducer", "strength": "strong"},
        {"enzyme": "CYP3A4", "role": "substrate", "strength": "moderate"},
    ],
    "phenytoin": [{"enzyme": "CYP3A4", "role": "inducer", "strength": "strong"}],
    "st john's wort": [{"enzyme": "CYP3A4", "role": "inducer", "strength": "strong"}],
    "atorvastatin": [{"enzyme": "CYP3A4", "role": "substrate", "strength": "moderate"}],
    "simvastatin": [{"enzyme": "CYP3A4", "role": "substrate", "strength": "strong"}],
    "lovastatin": [{"enzyme": "CYP3A4", "role": "substrate", "strength": "strong"}],
    "amlodipine": [{"enzyme": "CYP3A4", "role": "substrate", "strength": "moderate"}],
    "midazolam": [{"enzyme": "CYP3A4", "role": "substrate", "strength": "strong"}],
    "tacrolimus": [{"enzyme": "CYP3A4", "role": "substrate", "strength": "strong"}],
    "cyclosporine": [{"enzyme": "CYP3A4", "role": "substrate", "strength": "strong"}],
    "apixaban": [{"enzyme": "CYP3A4", "role": "substrate", "strength": "moderate"}],
    "rivaroxaban": [{"enzyme": "CYP3A4", "role": "substrate", "strength": "moderate"}],
    "sildenafil": [{"enzyme": "CYP3A4", "role": "substrate", "strength": "moderate"}],
    # CYP2D6
    "fluoxetine": [
        {"enzyme": "CYP2D6", "role": "inhibitor", "strength": "strong"},
        {"enzyme": "CYP2D6", "role": "substrate", "strength": "moderate"},
    ],
    "paroxetine": [
        {"enzyme": "CYP2D6", "role": "inhibitor", "strength": "strong"},
        {"enzyme": "CYP2D6", "role": "substrate", "strength": "moderate"},
    ],
    "bupropion": [{"enzyme": "CYP2D6", "role": "inhibitor", "strength": "strong"}],
    "quinidine": [{"enzyme": "CYP2D6", "role": "inhibitor", "strength": "strong"}],
    "duloxetine": [{"enzyme": "CYP2D6", "role": "inhibitor", "strength": "moderate"}],
    "codeine": [{"enzyme": "CYP2D6", "role": "substrate", "strength": "strong"}],
    "tramadol": [{"enzyme": "CYP2D6", "role": "substrate", "strength": "strong"}],
    "metoprolol": [{"enzyme": "CYP2D6", "role": "substrate", "strength": "moderate"}],
    "tamoxifen": [{"enzyme": "CYP2D6", "role": "substrate", "strength": "strong"}],
    "risperidone": [{"enzyme": "CYP2D6", "role": "substrate", "strength": "moderate"}],
    # CYP2C9
    "warfarin": [
        {"enzyme": "CYP2C9", "role": "substrate", "strength": "strong"},
        {"enzyme": "CYP3A4", "role": "substrate", "strength": "moderate"},
    ],
    "amiodarone": [
        {"enzyme": "CYP2C9", "role": "inhibitor", "strength": "moderate"},
        {"enzyme": "CYP3A4", "role": "inhibitor", "strength": "moderate"},
        {"enzyme": "CYP2D6", "role": "inhibitor", "strength": "moderate"},
    ],
    "celecoxib": [{"enzyme": "CYP2C9", "role": "substrate", "strength": "moderate"}],
    # CYP2C19
    "omeprazole": [
        {"enzyme": "CYP2C19", "role": "inhibitor", "strength": "moderate"},
        {"enzyme": "CYP2C19", "role": "substrate", "strength": "moderate"},
    ],
    "esomeprazole": [{"enzyme": "CYP2C19", "role": "inhibitor", "strength": "moderate"}],
    "clopidogrel": [{"enzyme": "CYP2C19", "role": "substrate", "strength": "strong"}],
    "citalopram": [{"enzyme": "CYP2C19", "role": "substrate", "strength": "moderate"}],
    "escitalopram": [{"enzyme": "CYP2C19", "role": "substrate", "strength": "moderate"}],
}

# ---------------------------------------------------------------------------
# QT-prolongation risk. risk ∈ {"known", "possible", "conditional"} per the
# CredibleMeds QTdrugs categorization. "known" = known TdP risk.
# ---------------------------------------------------------------------------
QT_RISK: dict[str, str] = {
    "amiodarone": "known",
    "sotalol": "known",
    "dofetilide": "known",
    "quinidine": "known",
    "procainamide": "known",
    "disopyramide": "known",
    "azithromycin": "known",
    "clarithromycin": "known",
    "erythromycin": "known",
    "levofloxacin": "known",
    "moxifloxacin": "known",
    "ciprofloxacin": "possible",
    "haloperidol": "known",
    "droperidol": "known",
    "thioridazine": "known",
    "ziprasidone": "possible",
    "quetiapine": "possible",
    "citalopram": "known",
    "escitalopram": "possible",
    "ondansetron": "known",
    "methadone": "known",
    "hydroxychloroquine": "known",
    "chloroquine": "known",
    "fluconazole": "possible",
    "domperidone": "known",
    "sertraline": "conditional",
    "venlafaxine": "possible",
}

# ---------------------------------------------------------------------------
# Serotonergic agents → mechanism class. Used for additive serotonergic load /
# serotonin-syndrome risk. Source: standard SS drug lists (Hunter criteria refs).
# ---------------------------------------------------------------------------
SEROTONERGIC: dict[str, str] = {
    # SSRIs
    "fluoxetine": "SSRI",
    "sertraline": "SSRI",
    "paroxetine": "SSRI",
    "citalopram": "SSRI",
    "escitalopram": "SSRI",
    "fluvoxamine": "SSRI",
    # SNRIs
    "venlafaxine": "SNRI",
    "desvenlafaxine": "SNRI",
    "duloxetine": "SNRI",
    # TCAs
    "amitriptyline": "TCA",
    "clomipramine": "TCA",
    "imipramine": "TCA",
    # MAOIs
    "phenelzine": "MAOI",
    "tranylcypromine": "MAOI",
    "isocarboxazid": "MAOI",
    "selegiline": "MAOI",
    "linezolid": "MAOI",  # weak reversible MAOI
    "methylene blue": "MAOI",
    # Opioids with serotonergic activity
    "tramadol": "opioid",
    "tapentadol": "opioid",
    "meperidine": "opioid",
    "fentanyl": "opioid",
    "methadone": "opioid",
    # Triptans
    "sumatriptan": "triptan",
    "rizatriptan": "triptan",
    "zolmitriptan": "triptan",
    # Other
    "trazodone": "other",
    "mirtazapine": "other",
    "buspirone": "other",
    "dextromethorphan": "other",
    "ondansetron": "other",
    "st john's wort": "herbal",
    "lithium": "other",
}

# Common name/synonym normalization to the keys above.
SYNONYMS: dict[str, str] = {
    "prozac": "fluoxetine",
    "zoloft": "sertraline",
    "paxil": "paroxetine",
    "celexa": "citalopram",
    "lexapro": "escitalopram",
    "effexor": "venlafaxine",
    "cymbalta": "duloxetine",
    "coumadin": "warfarin",
    "eliquis": "apixaban",
    "xarelto": "rivaroxaban",
    "plavix": "clopidogrel",
    "lipitor": "atorvastatin",
    "zocor": "simvastatin",
    "biaxin": "clarithromycin",
    "zithromax": "azithromycin",
    "ultram": "tramadol",
    "haldol": "haloperidol",
    "cordarone": "amiodarone",
    "norvasc": "amlodipine",
    "prilosec": "omeprazole",
    "nexium": "esomeprazole",
}


def normalize_name(name: str) -> str:
    """Lowercase, strip, and resolve common brand synonyms to the table key."""
    key = (name or "").strip().lower()
    return SYNONYMS.get(key, key)
