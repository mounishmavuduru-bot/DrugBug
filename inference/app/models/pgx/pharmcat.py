"""PharmacoFit — PharmCAT integration (PRD §10.4).

Pipeline:
  1. 23andMe / AncestryDNA raw genotype upload (consented).
  2. Convert raw genotype -> VCF.
  3. Run PharmCAT (Java subprocess): calls star-allele diplotypes, outputs CPIC
     phenotypes + guidance.
  4. Map active meds -> CPIC recommendation for that gene-phenotype.

If the PharmCAT jar is absent, returns an honest "PharmCAT not installed" status
— never a fabricated phenotype. Subprocess/stdlib only; no heavy Python deps.

Consumer-SNP caveat (PRD §10.4) is surfaced as a constant returned with every
result.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import tempfile
from typing import Any

from app.config import get_settings

CONSUMER_SNP_CAVEAT = (
    "Consumer SNP arrays do not capture all pharmacogenetic variation — notably "
    "CYP2D6 copy-number/structural variants and many rare alleles. PharmacoFit "
    "results are a screening aid; definitive pharmacogenetic typing for "
    "high-stakes decisions requires a targeted clinical assay. Confirm with your "
    "prescriber or a clinical pharmacogenomics service."
)

# Minimal GRCh38 contig header for the VCF we synthesize from raw genotype data.
_VCF_HEADER = (
    "##fileformat=VCFv4.2\n"
    "##source=DrugBugPharmacoFit\n"
    '##FILTER=<ID=PASS,Description="All filters passed">\n'
    '##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">\n'
    "#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tSAMPLE\n"
)


class PharmCATRunner:
    def __init__(self) -> None:
        self.settings = get_settings()

    @property
    def installed(self) -> bool:
        jar = self.settings.pharmcat_jar
        return bool(jar) and os.path.exists(jar)

    def status(self) -> dict[str, Any]:
        if not self.settings.pharmcat_jar:
            return {"available": False, "reason": "PHARMCAT_JAR not configured"}
        if not os.path.exists(self.settings.pharmcat_jar):
            return {"available": False, "reason": f"PharmCAT jar not found at {self.settings.pharmcat_jar}"}
        if not self._java_present():
            return {"available": False, "reason": "java runtime not found (JAVA_BIN)"}
        return {"available": True, "reason": None}

    def _java_present(self) -> bool:
        try:
            subprocess.run(
                [self.settings.java_bin, "-version"],
                capture_output=True,
                timeout=10,
                check=False,
            )
            return True
        except Exception:
            return False

    # ---- raw genotype -> VCF ----
    def raw_to_vcf(self, raw_text: str) -> str:
        """Convert a 23andMe / AncestryDNA raw genotype export to a minimal VCF.

        23andMe format: rsid  chromosome  position  genotype   (tab-separated)
        Ancestry format: rsid  chromosome  position  allele1  allele2
        Lines beginning with '#' are comments/headers. Produces a VCF body that
        PharmCAT's VCF preprocessor can consume (PharmCAT recommends running its
        preprocessor; this is the conversion stage that feeds it).
        """
        lines = [_VCF_HEADER.rstrip("\n")]
        for line in raw_text.splitlines():
            line = line.strip()
            if not line or line.startswith("#") or line.lower().startswith("rsid"):
                continue
            parts = re.split(r"\t|,", line)
            if len(parts) == 4:
                rsid, chrom, pos, geno = parts
                alleles = list(geno)
            elif len(parts) == 5:
                rsid, chrom, pos, a1, a2 = parts
                alleles = [a1, a2]
            else:
                continue
            alleles = [a for a in alleles if a in "ACGT"]
            if not alleles or not pos.isdigit():
                continue
            chrom = chrom if chrom.startswith("chr") else f"chr{chrom}"
            ref = alleles[0]
            alts = sorted({a for a in alleles if a != ref})
            alt = ",".join(alts) if alts else "."
            # Encode GT: 0 = ref, 1.. = alt index.
            allele_to_idx = {ref: 0}
            for i, a in enumerate(alts, start=1):
                allele_to_idx[a] = i
            gt = "/".join(str(allele_to_idx.get(a, 0)) for a in alleles)
            lines.append(
                f"{chrom}\t{pos}\t{rsid}\t{ref}\t{alt}\t.\tPASS\t.\tGT\t{gt}"
            )
        return "\n".join(lines) + "\n"

    # ---- run PharmCAT ----
    def run(self, raw_text: str) -> dict[str, Any]:
        """Full pipeline: raw -> VCF -> PharmCAT -> parsed phenotypes.

        Returns {"available": bool, "phenotypes": {gene: phenotype}, "report":
                 {...}, "caveat": CONSUMER_SNP_CAVEAT, "reason": str|None}.
        """
        st = self.status()
        if not st["available"]:
            return {
                "available": False,
                "phenotypes": {},
                "report": None,
                "caveat": CONSUMER_SNP_CAVEAT,
                "reason": st["reason"],
            }

        with tempfile.TemporaryDirectory() as tmp:
            vcf_path = os.path.join(tmp, "input.vcf")
            with open(vcf_path, "w") as f:
                f.write(self.raw_to_vcf(raw_text))
            out_dir = os.path.join(tmp, "out")
            os.makedirs(out_dir, exist_ok=True)
            try:
                subprocess.run(
                    [
                        self.settings.java_bin,
                        "-jar",
                        self.settings.pharmcat_jar,
                        "-vcf",
                        vcf_path,
                        "-o",
                        out_dir,
                        "-reporterJson",
                    ],
                    capture_output=True,
                    timeout=600,
                    check=True,
                )
            except subprocess.CalledProcessError as exc:
                return {
                    "available": False,
                    "phenotypes": {},
                    "report": None,
                    "caveat": CONSUMER_SNP_CAVEAT,
                    "reason": f"PharmCAT failed: {exc.stderr.decode('utf-8', 'replace')[:500]}",
                }
            except Exception as exc:
                return {
                    "available": False,
                    "phenotypes": {},
                    "report": None,
                    "caveat": CONSUMER_SNP_CAVEAT,
                    "reason": f"PharmCAT execution error: {exc}",
                }

            report = self._read_report(out_dir)
        phenotypes = self._extract_phenotypes(report)
        return {
            "available": True,
            "phenotypes": phenotypes,
            "report": report,
            "caveat": CONSUMER_SNP_CAVEAT,
            "reason": None,
        }

    def _read_report(self, out_dir: str) -> dict[str, Any] | None:
        for name in os.listdir(out_dir):
            if name.endswith(".report.json") or name.endswith(".reporter.json") or name.endswith(".json"):
                try:
                    with open(os.path.join(out_dir, name)) as f:
                        return json.load(f)
                except Exception:
                    continue
        return None

    def _extract_phenotypes(self, report: dict[str, Any] | None) -> dict[str, str]:
        """Pull {gene: phenotype} from a PharmCAT reporter JSON.

        PharmCAT's JSON schema has varied across releases; this reads the common
        `genes`/`phenotypes` shapes defensively.
        """
        if not report:
            return {}
        out: dict[str, str] = {}
        genes = report.get("genes") or {}
        if isinstance(genes, dict):
            for source in genes.values():
                if not isinstance(source, dict):
                    continue
                for gene, info in source.items():
                    pheno = _first_phenotype(info)
                    if pheno:
                        out[gene] = pheno
        elif isinstance(genes, list):
            for g in genes:
                gene = g.get("gene") or g.get("symbol")
                pheno = _first_phenotype(g)
                if gene and pheno:
                    out[gene] = pheno
        return out


def _first_phenotype(info: Any) -> str | None:
    if not isinstance(info, dict):
        return None
    for key in ("phenotypes", "phenotype", "mappedPhenotypes"):
        val = info.get(key)
        if isinstance(val, list) and val:
            return str(val[0])
        if isinstance(val, str) and val:
            return val
    return None


_instance: PharmCATRunner | None = None


def get_pharmcat() -> PharmCATRunner:
    global _instance
    if _instance is None:
        _instance = PharmCATRunner()
    return _instance
