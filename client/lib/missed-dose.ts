// Missed-Dose Recovery (PRD §9.2). Deterministic, drug-class-keyed guidance —
// NOT LLM-generated, to guarantee correctness. Class is derived from RxNorm/ATC
// classification (the Inference Service stores an ATC/therapeutic-class hint on
// the med; we also pattern-match generic names as a fallback so guidance works
// offline). Every output ends with "If unsure, call your pharmacist."

export type TherapeuticClass =
  | "anticoagulant"
  | "antidiabetic"
  | "antibiotic"
  | "antiepileptic"
  | "oral_contraceptive"
  | "default";

export interface RecoveryGuidance {
  klass: TherapeuticClass;
  title: string;
  steps: string[];
  neverDouble: boolean;
  flagPrescriber: boolean;
  callPharmacist: true;
}

const RULES: Record<TherapeuticClass, Omit<RecoveryGuidance, "klass" | "callPharmacist">> = {
  anticoagulant: {
    title: "Anticoagulant (e.g. warfarin, DOAC)",
    steps: [
      "If you are still within the class-specific window after your scheduled time, take the dose now.",
      "If it is past that window, skip it — do NOT take a double dose.",
      "Document the missed dose so your prescriber can review it.",
    ],
    neverDouble: true,
    flagPrescriber: true,
  },
  antidiabetic: {
    title: "Insulin / antidiabetic",
    steps: [
      "Do NOT double the dose to make up for the missed one.",
      "Check your blood glucose.",
      "Follow the timing guidance specific to your medication; resume your normal schedule.",
    ],
    neverDouble: true,
    flagPrescriber: false,
  },
  antibiotic: {
    title: "Antibiotic",
    steps: [
      "If you are within 50% of the time until your next dose, take it now.",
      "Otherwise skip it and resume your normal schedule — do not double up.",
      "Complete the full prescribed course even if you feel better.",
    ],
    neverDouble: true,
    flagPrescriber: false,
  },
  antiepileptic: {
    title: "Antiepileptic",
    steps: [
      "Take the dose as soon as you remember — unless it is nearly time for the next one.",
      "If it is nearly time for the next dose, skip the missed one and resume schedule.",
      "Missing doses can increase seizure risk — prioritize getting back on schedule.",
    ],
    neverDouble: true,
    flagPrescriber: true,
  },
  oral_contraceptive: {
    title: "Oral contraceptive",
    steps: [
      "Combined pill: if <24h late, take it now and continue as normal. If ≥24h late, follow the catch-up rules for your pack and consider backup contraception.",
      "Progestin-only pill: the window is much shorter (often 3h) — if later, use backup contraception for 48 hours.",
      "Check your specific pack insert; rules differ by formulation.",
    ],
    neverDouble: false,
    flagPrescriber: false,
  },
  default: {
    title: "General guidance",
    steps: [
      "If it is within about 2 hours of the scheduled time, take the dose now.",
      "Otherwise skip it and resume your normal schedule.",
      "Do not take two doses at once unless told to by a professional.",
    ],
    neverDouble: true,
    flagPrescriber: false,
  },
};

// Fallback generic-name → class matching (used when no ATC hint is present).
const NAME_HINTS: [TherapeuticClass, RegExp][] = [
  ["anticoagulant", /warfarin|apixaban|rivaroxaban|dabigatran|edoxaban|heparin/i],
  ["antidiabetic", /insulin|metformin|glipizide|glyburide|gliclazide|sitagliptin|empagliflozin|liraglutide|semaglutide/i],
  ["antibiotic", /cillin|cycline|floxacin|mycin|cephalexin|azithromycin|amoxicillin|metronidazole|doxycycline|ciprofloxacin/i],
  ["antiepileptic", /levetiracetam|lamotrigine|valproate|valproic|carbamazepine|phenytoin|topiramate|lacosamide|gabapentin|pregabalin/i],
  ["oral_contraceptive", /ethinyl|estradiol|norethindrone|levonorgestrel|drospirenone|norgestimate/i],
];

export function classifyMedication(opts: {
  atcClass?: string;
  genericName?: string;
  name?: string;
}): TherapeuticClass {
  const atc = (opts.atcClass || "").toLowerCase();
  if (atc) {
    if (/antithrombotic|anticoagulant|b01a/.test(atc)) return "anticoagulant";
    if (/diabet|insulin|a10/.test(atc)) return "antidiabetic";
    if (/antibacterial|antibiotic|j01/.test(atc)) return "antibiotic";
    if (/antiepileptic|n03/.test(atc)) return "antiepileptic";
    if (/contracept|g03a/.test(atc)) return "oral_contraceptive";
  }
  const hay = `${opts.genericName || ""} ${opts.name || ""}`;
  for (const [klass, re] of NAME_HINTS) if (re.test(hay)) return klass;
  return "default";
}

export function recoveryGuidance(opts: {
  atcClass?: string;
  genericName?: string;
  name?: string;
}): RecoveryGuidance {
  const klass = classifyMedication(opts);
  return { klass, ...RULES[klass], callPharmacist: true };
}
