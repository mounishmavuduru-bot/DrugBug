# DrugBug Founder Compliance Playbook — How to Obtain Each Launch-Blocking Item

> **This is operational guidance, not legal advice — engage qualified regulatory and legal counsel (PRD §16).**
>
> The data-licensing track, the DSCSA-supply-chain track, the FDA-device track, the
> clinical-validation track, and the privacy track are **separate workstreams**. They do
> not gate each other and should run in parallel. Nothing below should be read as a
> regulatory-status claim about DrugBug; all such claims must be cleared by counsel
> before being made publicly or to investors/partners.

This playbook maps directly to the **Founder action items — blocking real-world launch**
table in [`README.md`](../README.md) and PRD §21. For each item it answers: *what it is,
why it blocks launch, exact steps to obtain it, who to contact, rough cost/time, open
alternatives, and what DrugBug already does in-code to de-risk it.*

A consolidated sequence and a required-vs-optional table are in **§6**.

Cost and time figures are **directional signals from public sources as of mid-2026** and
must be re-confirmed — none of these vendors except LedgerDomain publish a rate card.

---

## 1. DrugBank / DDInter commercial data licensing

### What it is
The drug-drug interaction (DDI) knowledge that powers CascadeMap's always-on KB layer
(severity, mechanism, management text, citations) and the supervised signal for the
cascade GNN. DrugBug's ETL ingests **DDInter 2.0** (`etl/ingest_ddinter.py`) and
**TWOSIDES/OFFSIDES** (`etl/ingest_twosides.py`); CPIC/PharmGKB feeds PharmacoFit
(`etl/ingest_cpic.py`).

### Why it blocks commercial launch
The richest curated DDI databases are licensed **non-commercially**:

- **DrugBank full database** (the XML with all interaction/pharmacology data) is **CC BY-NC 4.0 — academic/non-commercial only.** Using it to power a consumer app is *explicitly prohibited*. Only two thin DrugBank datasets are CC0 (free for commercial use): **DrugBank Vocabulary** (IDs, names, synonyms) and **DrugBank Structures** — and *neither contains any DDI data.*
- **DDInter 2.0** (Nucleic Acids Research, Jan 2025) is **CC BY-NC 4.0** — free to browse and use non-commercially with attribution; commercial use requires explicit written permission. DrugBug's own `ingest_ddinter.py` header already flags this.

So: shipping a consumer product on the *full* DrugBank or on DDInter without a commercial
agreement is a license violation independent of any FDA question.

### Exact steps to obtain

**DrugBank commercial license**
1. Email **legal@drugbank.com** describing DrugBug as a consumer-facing medication-safety / interaction-checking app, and ask to open a commercial licensing conversation. Be explicit that you need **DDI data** (severity, description, management strategies, references) — *not just drug identifiers* — so they scope the right tier.
2. In parallel, go to **dev.drugbank.com** (or go.drugbank.com/clinical) and use **"Talk to sales"** to request an **API trial** / demo environment while you negotiate. (Note: at research time DrugBank had *paused academic downloads* during a distribution update — so a trial API is the realistic way to evaluate the data.)
3. Their three commercial product lines are the **Clinical Intelligence API**, the **Biopharma Intelligence OS**, and **Data Library / Snowflake** packages. For DrugBug, the **Clinical Intelligence API** (DDI severity + monographs) is the relevant one.
4. Expect a **negotiated annual contract**; pricing is not public.

**DDInter 2.0 commercial license**
1. Email **journals.permissions@oup.com** (Oxford University Press, the publisher that controls reuse rights) describing the commercial app and asking for a data-licensing arrangement for DDInter 2.0.
2. If OUP redirects to the authors, also email corresponding author **Dongsheng Cao at oriental-cds@163.com** for a direct data-sharing agreement.
3. Independently evaluate fitness-for-purpose: DDInter is an academic research database, **not a clinically validated decision-support product** — it lacks workflow-aligned severity tiers and EHR/pharmacy validation. Decide whether it clears DrugBug's quality bar *before* paying to license it.

### Who to contact
- DrugBank: **legal@drugbank.com**, sales via **dev.drugbank.com / go.drugbank.com/clinical**.
- DDInter: **journals.permissions@oup.com** (primary), **oriental-cds@163.com** (author).

### Rough cost / time
- **DrugBank:** no public pricing; community reports (Thinklab, ~2020) put early commercial API tiers in the **five-figure/year** range — directional only, get a current quote. Sales cycles for negotiated data contracts typically run weeks to a couple of months.
- **DDInter via OUP:** permissions processes are slow — **allow 4–8 weeks** for a response.

### Open alternatives (the free, commercially-usable interim stack DrugBug already supports)
DrugBug is architected so it does **not** depend on either paid source to ship a useful
interaction layer:

- **Keep the TWOSIDES/OFFSIDES-trained GNN.** TWOSIDES/OFFSIDES (Tatonetti Lab, nSIDES) are FAERS-derived signal data with **no stated commercial-use restriction** and are already ingested by `etl/ingest_twosides.py`. They train the cascade GNN as a *signal layer.* **Caveat:** these are observational pharmacovigilance signals, *not* clinician-curated DDI guidance, and are acknowledged out of date (pre-2022). Verify license terms directly with the Tatonetti Lab (tatonettilab.org) before shipping, since nsides.io publishes no explicit license, and do **not** present them as equivalent to a clinical compendium.
- **RxNorm / RxNav remains free for commercial use** (with NLM attribution; 20 req/sec; RxNav-in-a-Box for higher volume under a UMLS license). DrugBug already uses it via `integrations/rxnorm.py` for normalization and ATC class. Required attribution string: *"This product uses publicly available data from the U.S. National Library of Medicine (NLM)… NLM is not responsible for the product and does not endorse or recommend this or any other product."*
- **openFDA Drug Labeling + DailyMed** are free and commercially usable (already wired via `integrations/openfda.py` / `dailymed.py`). They expose the FDA label "Drug Interactions" section as **unstructured text** — display-as-is with caveats; they are not a coded DDI database.
- **DrugBank Vocabulary CC0 CSV** (and Structures SDF) — fully usable commercially with no attribution; use as a free drug-name-normalization layer mapping to canonical IDs. Contains no DDI data.

> **Critical migration note — already handled in DrugBug:** the **NLM RxNav Drug-Drug
> Interaction API was discontinued January 2, 2024.** Any code calling
> `rxnav.nlm.nih.gov/REST/interaction*` is dead. DrugBug does **not** use it — its DDI
> data comes from the Postgres KB (DDInter) + the mechanistic overlay + the GNN, and
> RxNav is used only for normalization/class. No migration needed; just don't reintroduce
> that endpoint.

### What DrugBug already does to de-risk
- **No hard dependency on a paid source to ship.** The KB layer can run on DDInter *academically during dev*, and the **always-on mechanistic overlay** (shared-CYP / additive-QT / serotonergic-load rule engine over a small bundled table) is **fully self-contained and license-free** — it produces real, citable cascade explanations with **zero** trained weights and **zero** licensed data.
- The GNN is trained on **open** TWOSIDES/OFFSIDES, not on licensed DrugBank.
- ETL scripts **version-pin** datasets and carry **in-code license headers** (PRD §13) flagging the commercial gate — provenance is auditable.
- The interaction layer degrades honestly: GNN predictions are labeled **unavailable** rather than fabricated when weights are absent.

---

## 2. DSCSA Authorized Trading Partner (ATP) status + VRS provider

### What it is
DrugScan **counterfeit layer 5** (serialized manufacturer verification) queries the GS1
**Verification Router Service (VRS)** to confirm a package's serial number against the
manufacturer's repository. To send a VRS request you must be a **DSCSA Authorized Trading
Partner** and present a short-lived ATP credential. In code this is gated behind
`DSCSA_VRS_ENDPOINT`, `DSCSA_VRS_CLIENT_ID`, `DSCSA_VRS_CLIENT_SECRET`, and
`DSCSA_VRS_ATP_GLN` (`integrations/dscsa_vrs.py`).

### Why it blocks (only layer 5)
ATP status under **FD&C Act §581/§582** is conferred by an **underlying license**, not by
a DEA number:
- **Dispenser** ATP status = a valid **state pharmacy/dispenser license**.
- **Wholesale distributor** ATP status = a valid **state WD license**, or a **federal WD license under §583** if the state has no WD framework.
- A **DEA registration alone does NOT confer ATP status** — it's orthogonal (controlled-substance scheduling). A DEA CSOS certificate can serve as *identity evidence* during credential issuance but cannot act as a DSCSA credential over the VRS.

Without the underlying license you cannot obtain an ATP credential, and without that
credential the manufacturer's VRS will not answer your verification request.

**Layers 1–4 ship without any of this** (see de-risk note below), so this item is
**optional for launch**, not required.

### Exact steps to obtain
1. **Get the qualifying license first (prerequisite for everything).** Apply to the **state board of pharmacy** for a pharmacy/dispenser license in each operating state, *or* obtain a state WD license (or §583 federal WD license). Reference: NCBOP DSCSA Dispenser Guide.
2. **Enroll with a credential issuer.** **Legisym** verifies your state license (DEA CSOS cert as supporting ID evidence) and issues an **OCI-compliant verifiable credential**.
3. **Load the credential into an OCI wallet** — **LedgerDomain XATP** or **Spherity CARO**. The wallet issues the short-lived (≈5-minute) signed ATP credential per request.
4. **Connect the wallet to a Gateway-Certified VRS node** (LVMS R1.3). Confirm certification at **gatewaychecker.com**.
5. **Wire the VRS endpoint into DrugBug:** set `DSCSA_VRS_ENDPOINT`, `_CLIENT_ID`, `_CLIENT_SECRET`, and your **ATP GLN** in `DSCSA_VRS_ATP_GLN`. The `DSCSAVerificationProvider` interface returns `verified | not-verified | unknown`.
6. **Maintain it:** a lapsed state license stops credential issuance and revokes ATP status regardless of wallet subscription.

### Who to contact + provider shortlist
- **Credential issuer:** Legisym (embedded in the LedgerDomain flow).
- **VRS / wallet providers** (the four named in `.env.example`):
  - **LedgerDomain XATP** — **the only vendor with a public rate card**; clearest self-serve path. Wallet + Verification Plus VRS requester.
  - **Spherity CARO** — Compliance-as-a-Service; often *bundled* by serialization vendors (TraceLink/Movilitas/rfxcel) so you may already get it. Book via spherity.com; docs at learn.caro.vc.
  - **Movilitas.Cloud** — Gateway Certified; offers a **free DSCSA mobile app** for manual scan-and-verify (good for evaluation, **not** an API path). Enterprise SaaS via movilitas.cloud.
  - **Antares Vision / rfxcel** — Gateway Certified; embeds LedgerDomain XATP. Enterprise, best if already on their serialization stack. **info@antaresvision.com**.
  - **TraceLink** — largest network node ("integrate once, interoperate with everyone"); enterprise/quote-based; best for high-volume manufacturers/large wholesalers. tracelink.com/contact.

### Rough cost / time
- **LedgerDomain XATP published tiers (annual):** Small Dispenser **$349**, Large Dispenser **$2,000**, Wholesaler **$3,900**, Manufacturer **$9,000**, Enterprise custom. (Public page; confirm current.)
- TraceLink / Spherity / rfxcel / Movilitas SaaS: **quote-based, no public pricing.**
- **State pharmacy/WD licensing** dominates the timeline and cost — application + inspection cycles vary widely by state; budget weeks to months and state-specific fees.
- **Movilitas free mobile app:** $0 — fastest way to *evaluate* VRS before integrating.

### Open alternatives
- **Movilitas.Cloud free mobile app** for an immediate, zero-cost manual scan-and-verify workflow during evaluation (not programmatic).
- For a **DrugScan API integration** you still need a paid programmatic tier (REST over HTTPS) from one of the providers above.
- If DrugBug is *consumer-only* (patients scanning their own meds, not transacting/distributing drugs), revisit with counsel **whether DrugBug needs ATP status at all** — VRS verification is designed for trading partners in the supply chain. This determination materially changes whether item 2 is ever in scope.

### What DrugBug already does to de-risk
- **Layers 1–4 ship today with no ATP credential:** GS1 DataMatrix barcode decode (server-side), openFDA **NDC validity**, openFDA **recall/enforcement**, and Claude-Vision **physical-anomaly** signal. These already produce a real authenticity verdict.
- Layer 5 is a **clean credential gate**: absent `DSCSA_VRS_*`, `dscsa_vrs.py` returns an explicit *"serialized verification unavailable — ATP credentials not configured"* — never a fake pass/fail (PRD §10.1).
- The provider interface is **vendor-neutral** (`DSCSAVerificationProvider`), so any Gateway-Certified VRS can be dropped in by config alone.

---

## 3. FDA SaMD classification + regulatory strategy

### What it is
A documented regulatory determination of whether DrugBug's software functions are
**Software as a Medical Device (SaMD)**, which pathway applies, and a plan to engage FDA.

### Why it blocks commercial launch
A **patient-facing pill identifier + interaction/cascade risk analyzer is almost certainly
a regulated device** (likely **Class II**, possibly III under the IMDRF risk matrix):

- The **21st Century Cures non-device CDS exemption** (§520(o)(1)(E)) **does not apply**, on at least two independent grounds:
  - **Criterion 1** bars tools that *acquire/process/analyze a medical image* — a camera-based pill ID does exactly that.
  - **Criterion 3** requires recommendations to be directed at a **healthcare professional**, not a patient — a D2C consumer app fails this by definition.
- FDA's **January 2026 CDS guidance** reaffirmed that *"CDS intended to support or provide recommendations to patients or caregivers (non-HCPs) meets the definition of a device,"* and the Jan-2026 single-recommendation enforcement-discretion expansion **explicitly excludes image-analyzing and patient-facing tools.**

So a public launch making interaction-risk or pill-ID claims without addressing device
status is an enforcement risk.

### Likely pathway
- **De Novo is the primary realistic pathway** (no obvious cleared predicate for *pill ID + interaction risk* combined as of 2026). De Novo establishes a new Class II classification (~150 FDA review days) and requires analytical + clinical validation.
- **510(k)** only if a matching predicate emerges.
- **PMA (Class III)** unlikely unless the cascade analysis directly drives high-stakes therapy without HCP review.
- **AI/ML updates:** submit a **Predetermined Change Control Plan (PCCP)** (per FDA's Aug-2025 PCCP guidance) alongside the De Novo so the pill-ID/GNN models can be retrained within defined performance bounds without a new submission.
- **PGx component:** scope its intended use as **informational display of CPIC-guideline-based metabolism predictions**, *not* specific dosing recommendations — this argues a lower IMDRF tier, especially since DrugBug *interprets user-uploaded* PGx results rather than performing sequencing.

### Exact steps
1. **Engage FDA regulatory counsel first** — ideally a former CDRH reviewer or a firm with **De Novo SaMD** experience — *before writing a single intended-use statement.* The intended-use wording drives classification.
2. **Scope each function's intended use narrowly and separately** (pill ID; interaction/cascade; PGx). Avoid broad claims that inflate the IMDRF category.
3. **Run a formal IMDRF classification analysis** and document why pill-ID + interaction is Category II, not III.
4. **Document internally that the CDS exemption does not apply** (Criteria 1 & 3 failing) — protects against later willful-non-compliance claims.
5. **File a Q-Sub Pre-Submission with FDA CDRH** via **eSTAR to the Document Control Center.** Package: device overview, intended-use statement, IMDRF rationale, proposed De Novo pathway, draft analytical + clinical evidence plan, PCCP concept, cybersecurity scope (SBOM/threat model), and **4–6 specific answerable questions**. FDA acknowledges with a Q-number; written feedback in **~70 days**, optional 1-hour meeting (≈2.5–3 months total).
6. **Assess the TEMPO pilot** (real-world data collection under temporary enforcement discretion) for lower-risk functionality during the data phase — with counsel; it is not a blanket exemption.
7. **Produce a written regulatory-strategy roadmap** mapping each feature → classification → pathway → evidence requirement, *before* finalizing production scope (drives product prioritization and investor/partner disclosure).

### Who to contact
- FDA regulatory counsel (CDRH/De Novo SaMD experience) — engage before any FDA contact.
- **FDA CDRH** via the Q-Sub program (eSTAR submission), after counsel.

### Rough cost / time
- Regulatory counsel through first Pre-Sub response: **~$50K–$150K**.
- **Full De Novo pathway: ~$500K–$2M+** depending on clinical-study scale.
- Q-Sub written feedback in ~70 days; De Novo review ~150 FDA days (excluding study time).

### Open alternatives / risk-reducers
- **Pre-Sub is free and voluntary** — the cheapest way to get FDA's evidence expectations in writing before spending on studies.
- Consider whether **non-clinical functions** (scheduling, reminders, logging, refills, label-text display) can launch first as clearly **non-device** wellness/administrative features while the device functions go through De Novo. DrugBug's architecture already separates these surfaces.

### What DrugBug already builds in to de-risk (PRD §5/§11/§16)
These are the engineered mitigations that strengthen the safety case and that counsel can
point to:
- **Calibrated confidence gating:** pill ID above threshold auto-identifies; **below threshold returns top-3 candidates + requires user confirmation** — never asserts a single identity at low confidence (Platt/temperature scaling).
- **Deterministic fallback:** low-confidence ML routes to the rule-based mechanistic overlay / deterministic Missed-Dose Recovery engine, not to a fabricated answer.
- **"Confirm with your pharmacist or prescriber" framing** on every clinical-adjacent output (PRD §5/§16).
- **No diagnostic claims:** *"Nothing in this product diagnoses disease or replaces a clinician."* Outputs are explicitly decision-support.
- **Claude is never the decision-maker:** per the inference contract, Claude is *never* used to compute interaction risk, identify the pill, or render the authenticity verdict — it only returns structured vision signals and prose briefs.
- **Honest unavailability:** gated capabilities report "unavailable" rather than guessing (PRD §5.3 / §10.1).

---

## 4. Clinical validation study

### What it is
Prospective performance evidence — **sensitivity/specificity against labeled ground
truth** — for the pill-ID model and the cascade/interaction detector, designed to support
the De Novo submission and any clinical claims.

### Why it blocks clinical claims
You cannot make performance or safety claims (or clear De Novo) without validation on a
**held-out, pre-specified** dataset. Published academic pill-ID accuracy (~74–86% top-1,
~89–92% top-3; ~78% top-1 on consumer images) is **below** what FDA will likely require —
the bar is set in the Q-Sub, not by literature.

### Exact study design (align with FDA at Pre-Sub *before* collecting data)

**Pill ID**
- **Reference standard:** a pharmacist-verified pill database — NLM **Pillbox-derived** / NDC-linked reference images (DrugBug's `etl/ingest_pill_reference.py` already targets ePillID / C3PI / DailyMed attribute sources).
- **Held-out test set:** completely separated from training/fine-tuning data (**no leakage**).
- **Pre-specified targets:** sensitivity and specificity **by failure mode** (missed ID vs. *wrong* ID), each with **95% CIs**.
- **Subgroup analyses:** shape, color, imprint style, generic vs. brand, partial/damaged pills.
- **Real-world conditions:** poor lighting, camera angles, partial occlusion.

**Cascade / interaction detection**
- **Reference standard:** a validated DDI compendium (Lexicomp / Micromedex / Drugs.com) **plus clinical-pharmacist adjudication.**
- **Primary endpoint:** **sensitivity for clinically significant interactions (Severity Level 1–2).**
- Pre-register the protocol.

**PGx component**
- Reference standards: **FDA Table of Pharmacogenetic Associations** + **CPIC guidelines** (DrugBug ingests CPIC via `etl/ingest_cpic.py`). Validate the *interpretation/mapping*, scoped as informational.

### Exact steps
1. At the **Q-Sub (§3)**, get FDA's written agreement on reference standards, endpoints, performance thresholds, and subgroup plan **before** collecting data.
2. Secure **IRB review/approval** for any human-subjects data collection (and informed consent for image/PGx data).
3. Assemble labeled ground-truth datasets with documented provenance and a frozen train/test split.
4. Run the study to the pre-registered protocol; report sensitivity/specificity with CIs and subgroup breakdowns.
5. Feed results back into the De Novo submission and the PCCP performance bounds.

### Who to contact
- A **CRO or academic clinical-validation partner** for study execution.
- An **IRB** (commercial IRB such as WCG/Advarra, or an academic IRB if partnered).
- **Clinical pharmacist(s)** for interaction-adjudication ground truth.
- FDA CDRH (via the Q-Sub) to lock the design.

### Rough cost / time
- Folds into the **~$500K–$2M+ De Novo** envelope; the clinical study is the largest swing factor. Timeline driven by recruitment/data collection (months to >1 year). Pre-Sub alignment first prevents expensive rework.

### Open alternatives
- Begin with **retrospective analytical validation** on public labeled sets (ePillID, C3PI, Pillbox) to characterize the models cheaply and de-risk the prospective design — but FDA will likely require **prospective** data for clearance; confirm at Pre-Sub.

### What DrugBug already does to de-risk
- The pill pipeline is built as **discrete, independently-measurable layers** (detection → imprint OCR → visual-embedding NN → attribute filters → calibrated fusion), so per-layer sensitivity/specificity can be reported cleanly.
- ETL already targets the **pharmacist-verified reference galleries** (ePillID / C3PI / DailyMed) that serve as ground truth.
- **Calibrated confidence** (fusion + Platt/temperature scaling) means the output already exposes the probability needed for ROC/threshold analysis.
- The cascade layer separates **citable KB pairs** from **model-predicted** edges, so the model's contribution can be validated independently of the authoritative KB.

---

## 5. HIPAA-aligned + genetic / biometric privacy review

### What it is
A privacy-compliance posture covering health data, **genetic/PGx data**, and any
**biometric** processing across the relevant federal and state regimes.

### Why it blocks launch
- **HIPAA likely does NOT apply** to a standalone D2C app that doesn't bill insurance, isn't part of a provider workflow, and doesn't transmit to providers (same posture as 23andMe). **But that creates a gap:** user health data (med lists, **PGx results, images**) has *no federal privacy floor*, and the **FTC Act §5** + the amended-2024 **FTC Health Breach Notification Rule** (which now explicitly covers consumer health apps) fill only part of it.
- **Genetic data** triggers a **fast-expanding state patchwork** plus a federal data-transfer rule:
  - **Texas Genomic Act 2025 (HB 130)** — broad requirements on genome testing of TX residents; bars transfer to foreign adversaries; $5,000/violation civil + $10,000 AG enforcement.
  - **Montana SB 163 (2025)** — requires **separate express consent** for each of: third-party sharing, secondary use, sample retention, marketing, and sale.
  - **Indiana HB 1521 (2025)** — written consent + deletion rights for DTC genetic testing.
  - **DOJ Bulk Data Rule (effective Apr 8, 2025)** — restricts transfers of genomic data on **>100 US persons** to countries of concern *even if anonymized/encrypted* (criminal + civil exposure).
  - **GINA** bars genetic discrimination by insurers/employers but doesn't regulate app data practices directly.
- **Biometric (BIPA/CUBI/WA My Health My Data):** a **pill image is not a biometric identifier** — but if any face detection/liveness is used (even incidentally), BIPA-style written consent, retention schedules, and no-sale provisions are triggered in IL/TX/WA. (A 2025 skincare-AI case held that even temporary facial-geometry extraction triggers BIPA, and the medical exception requires HIPAA-covered status a D2C app lacks.)

### Exact steps
1. **Engage privacy counsel** with health-data + state-genetic-privacy + biometric experience.
2. **Confirm HIPAA status in writing** (covered entity / business associate or not) for DrugBug's specific data flows.
3. **Implement HIPAA-aligned technical safeguards as a baseline even if HIPAA doesn't apply:** encryption at rest (AES-256) and in transit (TLS 1.3+), role-based/least-privilege access, audit logging, minimum-necessary data, and **written BAAs/DPAs with every cloud/AI vendor** handling PHI-equivalent data (Anthropic, object storage, hosting).
4. **Build state genetic-privacy infrastructure:** per-state **consent gating** (MT/IN/TX as highest-risk), a **user-accessible deletion portal** covering data *and* any retained samples, and documented data flows for **DOJ Bulk Data Rule** compliance (no >100-person genomic transfers to countries of concern; vet partners/vendors for foreign-adversary connections).
5. **Biometric audit:** determine whether *any* part of the image pipeline processes face geometry. If **no**, document the technical constraint (pill-only capture). If **yes**, add written consent, a published retention schedule, and no-sale provisions before launching in IL/TX/WA.
6. **Adopt a privacy policy** that meets/exceeds HIPAA standards and discloses the FTC Health Breach Notification obligations.
7. **Re-audit quarterly** — the state genetic-privacy landscape (13+ states active mid-2026) changes fast.

### Who to contact
- Health-data / genetic-privacy / biometric **privacy counsel**.
- Cloud + AI vendors (**Anthropic**, R2/S3 provider, hosting) for **BAAs/DPAs**.

### Rough cost / time
- Privacy counsel for an initial review + policy + state-law gating analysis: typically tens of thousands of dollars; weeks to a couple of months. Re-audit budget quarterly.

### Open alternatives
- None on the legal obligations — but the **engineering** can launch in low-risk states first while genetic features stay gated, narrowing the initial compliance surface.

### What DrugBug already does to de-risk
- **Identity-scoped data model:** SpacetimeDB OIDC identity per user; **write-path authorization enforced today**; **RLS read filters land automatically** when the platform ships the upstream RLS read-path (tracked in `module/README.md`).
- **Least-privilege service identity:** the inference service is **allowlisted** via `grant_service_identity` and can only call specific writeback reducers.
- **Audit log** table in the module.
- **Consent surfacing for PGx** and the consumer-SNP limitation caveat are built into the PharmacoFit flow (PRD §10.4).
- **PGx is interpret-only** (user uploads 23andMe/Ancestry raw → VCF → PharmCAT) — DrugBug does not sequence, lowering both device and privacy risk.
- **Pill-only image capture** with **no face detection** in the pipeline (documentable technical constraint for the BIPA audit).
- Secrets/keys are **env-gated, not committed** (`.env.example` placeholders only).

---

## 6. Suggested sequence + required-vs-optional (mirrors PRD §21)

### Required before commercial launch vs. optional

| Item | Status | Gate in code |
|---|---|---|
| **GPU access for training** (GNN + pill models) | **Required before model training** | `CASCADE_GNN_WEIGHTS`, `PILL_EMBEDDER_WEIGHTS`, `IMPRINT_OCR_WEIGHTS` |
| **DrugBank / DDInter commercial license** (§1) | **Required before commercial launch** (if shipping on those sources; the open stack avoids it) | KB Postgres source |
| **FDA SaMD classification + regulatory counsel** (§3) | **Required before commercial launch** | N/A (process) |
| **Clinical validation study** (§4) | **Required before clinical claims** | N/A (process) |
| **HIPAA-aligned + genetic/biometric privacy review** (§5) | **Required before launch** | N/A (process) |
| **ATP status + VRS provider** (§2) | **Optional — layers 1–4 ship without it** | `DSCSA_VRS_*`, `DSCSA_VRS_ATP_GLN` |

### Recommended sequence

**Phase 0 — start in parallel, immediately (gate everything else):**
1. **Engage FDA regulatory counsel + privacy counsel** (§3, §5). The intended-use wording counsel helps write **determines classification** and shapes the privacy posture — do this before product copy is finalized.
2. **Open the data-licensing conversations** (§1: DrugBank `legal@`, DDInter via OUP) — long lead times (4–8 weeks for OUP), so start early even if you intend to ship on the open stack.

**Phase 1 — foundation, in parallel:**
3. **Scope intended use + run IMDRF classification** with counsel (§3).
4. **Secure GPU and train** the GNN (on open TWOSIDES/OFFSIDES) and pill models — required before any validation has something to measure.
5. **Stand up privacy infrastructure** (§5): safeguards, BAAs, consent gating, deletion portal, DOJ-rule data-flow documentation, biometric constraint documentation.

**Phase 2 — FDA engagement:**
6. **File the Q-Sub Pre-Submission** (§3) — *and lock the clinical-study design in the same Pre-Sub* (§4) so you don't collect data twice.

**Phase 3 — evidence:**
7. **Run the clinical validation study** (§4) to the FDA-agreed protocol (IRB-approved), then fold results into the De Novo + PCCP.

**Phase 4 — commercial-data + launch gating:**
8. **Close the DrugBank/DDInter commercial license** (§1) *or* confirm the open stack (TWOSIDES/OFFSIDES GNN + mechanistic overlay + RxNorm + openFDA/DailyMed) is the launch source.
9. **De Novo submission** → clearance → commercial launch with cleared claims.

**Anytime / optional track:**
10. **ATP + VRS** (§2) — pursue only if/when DrugScan layer 5 is in scope; first confirm with counsel whether a consumer app needs ATP status at all. Layers 1–4 already ship the counterfeit feature without it.

> **Closing reminder — this is operational guidance, not legal advice. The data-licensing,
> DSCSA, FDA-device, clinical-validation, and privacy tracks are distinct legal questions;
> engage qualified regulatory and legal counsel before filing anything, making any
> regulatory-status or clinical claim, or launching (PRD §16/§21).**
