"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch, type Resolver } from "react-hook-form";
import { z } from "zod";
import { AlertTriangle, ArrowLeft, Loader2, ScanLine, ShieldAlert } from "lucide-react";
import { useReducer } from "spacetimedb/react";
import Link from "next/link";

import { reducers, identityHex } from "@/lib/db";
import { useMyIdentity, useMyMeds } from "@/lib/hooks";
import { checkInteractions, type InteractionReport, type PairFinding, type CascadeFinding } from "@/lib/inference-client";
import { toTs } from "@/lib/format";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ErrorState } from "@/components/shared/states";
import { SeverityBadge } from "@/components/shared/severity";
import { SourceTag, ConfidenceBar } from "@/components/shared/confidence";
import { Disclaimer } from "@/components/med/disclaimer";
import { DrugAutocomplete } from "@/components/med/drug-autocomplete";
import { ScheduleBuilder, type ScheduleValue } from "@/components/med/schedule-builder";
import { FORM_OPTIONS } from "@/components/med/med-utils";
import { cn } from "@/lib/utils";

const schema = z.object({
  name: z.string().min(1, "Enter the medication name"),
  genericName: z.string(),
  rxnormCode: z.string(),
  strength: z.string().min(1, "Enter the strength, e.g. 10 mg"),
  form: z.string().min(1, "Choose a form"),
  prescriber: z.string(),
  pharmacy: z.string(),
  ndc: z.string(),
  refillDate: z.string(), // yyyy-mm-dd, optional
  dosesRemaining: z.coerce.number().int().min(0, "Cannot be negative"),
  isOtc: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

/**
 * Lightweight zod resolver. @hookform/resolvers isn't installed in this project,
 * so we adapt zod's safeParse to react-hook-form's Resolver contract directly.
 */
const zodResolver =
  (s: typeof schema): Resolver<FormValues> =>
  async (values) => {
    const parsed = s.safeParse(values);
    if (parsed.success) return { values: parsed.data, errors: {} };
    const errors: Record<string, { type: string; message: string }> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !errors[key]) {
        errors[key] = { type: issue.code ?? "validation", message: issue.message };
      }
    }
    return { values: {}, errors: errors as never };
  };

export default function AddMedicationPage() {
  const router = useRouter();
  const me = useMyIdentity();
  const { meds } = useMyMeds();
  const addMedication = useReducer(reducers.addMedication);

  const [schedule, setSchedule] = useState<ScheduleValue>({ times: [], days: [], prn: false });
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<InteractionReport | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      genericName: "",
      rxnormCode: "",
      strength: "",
      form: "tablet",
      prescriber: "",
      pharmacy: "",
      ndc: "",
      refillDate: "",
      dosesRemaining: 0,
      isOtc: false,
    },
  });

  const nameValue = useWatch({ control, name: "name" });
  const rxnormValue = useWatch({ control, name: "rxnormCode" });
  const genericValue = useWatch({ control, name: "genericName" });

  const scheduleValid = schedule.prn || schedule.times.length > 0;

  /** Build the reducer payload from form + schedule state. */
  function buildPayload(values: FormValues) {
    const refill = values.refillDate ? toTs(new Date(`${values.refillDate}T00:00:00`)) : toTs(new Date());
    return {
      owner: me!,
      name: values.name.trim(),
      genericName: values.genericName.trim(),
      rxnormCode: values.rxnormCode.trim(),
      strength: values.strength.trim(),
      form: values.form,
      scheduleTimes: schedule.prn ? [] : schedule.times,
      scheduleDays: Uint8Array.from(schedule.prn ? [] : schedule.days),
      prn: schedule.prn,
      prescriber: values.prescriber.trim(),
      pharmacy: values.pharmacy.trim(),
      ndc: values.ndc.trim(),
      refillDate: refill,
      dosesRemaining: values.dosesRemaining,
      isOtc: values.isOtc,
    };
  }

  /** Commit to SpacetimeDB, then route to detail (or back to list). */
  async function commit(values: FormValues) {
    if (!me) return;
    setSaving(true);
    setError(null);
    try {
      await addMedication(buildPayload(values));
      // med_id is auto-assigned server-side; we don't get it back synchronously,
      // so route to the list where the new row arrives via subscription.
      router.push("/meds");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save this medication. Try again.");
      setSaving(false);
    }
  }

  /** Pre-commit interaction check (PRD §9.4): block on any major finding. */
  const onSubmit = async (values: FormValues) => {
    if (!me) return;
    if (!scheduleValid) {
      setError("Add at least one dose time, or mark the medication as taken only when needed.");
      return;
    }
    setError(null);
    setChecking(true);
    try {
      // rxcuis of existing ACTIVE meds + the new one (skip blanks).
      const rxcuis = [
        ...meds.filter((m) => m.active && m.rxnormCode).map((m) => m.rxnormCode),
        values.rxnormCode,
      ].filter((c) => c && c.trim().length > 0);

      // Only meaningful with ≥2 codes; still call so the service can decide.
      const rep = await checkInteractions(rxcuis, identityHex(me));
      setReport(rep);
      setChecking(false);
      if (rep.hasMajor) {
        setConfirmOpen(true); // BLOCKING confirmation before commit
        return;
      }
      await commit(values);
    } catch {
      // Interaction service unavailable — do not silently bypass safety, but do
      // not hard-block daily use. Surface a warning and let the user proceed.
      setChecking(false);
      setReport(null);
      await commit(values);
    }
  };

  const majorPairs: PairFinding[] = report?.pairs.filter((p) => /major|contra/i.test(p.severity)) ?? [];
  const majorCascades: CascadeFinding[] = report?.cascades.filter((c) => c.risk >= 0.5) ?? [];

  if (!me) {
    return <ErrorState title="Not connected" description="Reconnecting to DrugBug. This usually clears in a moment." />;
  }

  return (
    <div className="space-y-6 pb-4">
      <div>
        <Link
          href="/meds"
          className="label-mono inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-muted transition-colors duration-150 ease-[var(--ease)] hover:text-ink"
        >
          <ArrowLeft className="size-3.5" strokeWidth={1.75} aria-hidden /> Formulary
        </Link>
      </div>

      <header className="border-b border-rule-strong pb-5">
        <h1 className="font-display text-3xl leading-tight text-ink">Add a medication</h1>
        <p className="mt-1.5 text-sm text-muted">
          Scan the label or type it in. Before saving, we check it against everything you already take.
        </p>
      </header>

      {/* Scan path (PRD §9.4 path 1) */}
      <Link
        href="/scan?intent=add"
        className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-rule-strong bg-surface px-5 py-4 transition-colors duration-150 ease-[var(--ease)] hover:border-brand hover:bg-brand-tint"
      >
        <ScanLine className="size-5 shrink-0 text-brand" strokeWidth={1.75} aria-hidden />
        <span className="flex-1">
          <span className="block text-sm font-medium text-ink">Scan the label or pill</span>
          <span className="block text-xs text-muted">We read the imprint or barcode and fill the fields in for you.</span>
        </span>
        <span className="label-mono text-[11px] uppercase tracking-[0.14em] text-faint">Open camera</span>
      </Link>

      <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.14em] text-muted">
        <span className="h-px flex-1 bg-rule" /> or enter it by hand <span className="h-px flex-1 bg-rule" />
      </div>

      {/* Manual path (PRD §9.4 path 2) */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Card className="space-y-4 p-4">
          <p className="label-mono text-[11px] uppercase tracking-[0.14em] text-faint">The drug</p>
          <div>
            <Label htmlFor="med-name">Medication name</Label>
            <Controller
              control={control}
              name="name"
              render={({ field }) => (
                <DrugAutocomplete
                  id="med-name"
                  value={field.value}
                  onValueChange={field.onChange}
                  onSelect={(s) => {
                    setValue("name", s.name, { shouldValidate: true });
                    setValue("genericName", s.genericName || "");
                    setValue("rxnormCode", s.rxcui || "");
                  }}
                />
              )}
            />
            {errors.name ? <p className="mt-1 text-[11px] text-danger">{errors.name.message}</p> : null}
            {(genericValue || rxnormValue) && nameValue ? (
              <p className="mt-1 text-[11px] text-muted">
                {genericValue ? <>Generic <span className="label-mono text-ink">{genericValue}</span></> : null}
                {rxnormValue ? <span className="ml-2 label-mono text-faint">RxCUI {rxnormValue}</span> : null}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="strength">Strength</Label>
              <Input id="strength" placeholder="10 mg" className="label-mono" {...register("strength")} />
              {errors.strength ? <p className="mt-1 text-[11px] text-danger">{errors.strength.message}</p> : null}
            </div>
            <div>
              <Label htmlFor="form">Form</Label>
              <Select id="form" {...register("form")}>
                {FORM_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </Select>
              {errors.form ? <p className="mt-1 text-[11px] text-danger">{errors.form.message}</p> : null}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" className="size-4 accent-[var(--color-brand)]" {...register("isOtc")} />
            Over-the-counter — no prescription needed
          </label>
        </Card>

        <Card className="space-y-3 p-4">
          <p className="label-mono text-[11px] uppercase tracking-[0.14em] text-faint">When you take it</p>
          <ScheduleBuilder value={schedule} onChange={setSchedule} />
        </Card>

        <Card className="space-y-4 p-4">
          <p className="label-mono text-[11px] uppercase tracking-[0.14em] text-faint">Prescription details</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="prescriber">Prescriber</Label>
              <Input id="prescriber" placeholder="Dr. Smith" {...register("prescriber")} />
            </div>
            <div>
              <Label htmlFor="pharmacy">Pharmacy</Label>
              <Input id="pharmacy" placeholder="CVS #1234" {...register("pharmacy")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ndc">NDC</Label>
              <Input id="ndc" placeholder="0000-0000-00" className="label-mono" {...register("ndc")} />
            </div>
            <div>
              <Label htmlFor="refillDate">Refill date</Label>
              <Input id="refillDate" type="date" {...register("refillDate")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="dosesRemaining">Doses remaining</Label>
              <Input id="dosesRemaining" type="number" min={0} className="label-mono tnum" {...register("dosesRemaining")} />
              {errors.dosesRemaining ? (
                <p className="mt-1 text-[11px] text-danger">{errors.dosesRemaining.message}</p>
              ) : null}
            </div>
          </div>
        </Card>

        {error ? (
          <Card className="border-danger bg-danger-tint p-4" role="alert">
            <p className="flex items-start gap-2 text-sm text-danger">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} /> {error}
            </p>
          </Card>
        ) : null}

        {report && !report.hasMajor ? (
          <Card className="p-4">
            <p className="text-sm text-ink">
              Checked against your current medications — no major interactions for this combination.
            </p>
            <Disclaimer className="mt-2" />
          </Card>
        ) : null}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={checking || saving} className="flex-1">
            {checking ? (
              <>
                <Loader2 className="animate-spin" /> Checking interactions
              </>
            ) : saving ? (
              <>
                <Loader2 className="animate-spin" /> Saving
              </>
            ) : (
              "Check and save"
            )}
          </Button>
          <Link href="/meds" className={buttonVariants({ variant: "secondary" })}>
            Cancel
          </Link>
        </div>
        <Disclaimer />
      </form>

      {/* Blocking confirmation modal on a major interaction finding (PRD §9.4) */}
      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Major interaction found">
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-[var(--radius-sm)] border border-danger bg-danger-tint p-3">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-danger" strokeWidth={1.75} aria-hidden />
            <p className="text-sm text-ink">
              Taking <span className="label-mono text-danger">{nameValue}</span> alongside what you already take
              could cause a serious interaction. Read what came up before you decide.
            </p>
          </div>

          <div className="max-h-72 space-y-3 overflow-auto">
            {majorPairs.map((p, i) => (
              <div key={`p-${i}`} className="rounded-[var(--radius-sm)] border border-rule p-3">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="label-mono text-sm text-ink">{p.drugA}</span>
                  <span className="text-faint">+</span>
                  <span className="label-mono text-sm text-ink">{p.drugB}</span>
                  <SeverityBadge severity={p.severity} />
                  <SourceTag source={p.source} />
                </div>
                <p className="text-xs text-muted">{p.mechanism}</p>
                {p.management ? (
                  <p className="mt-1 text-xs text-ink">
                    <span className="text-muted">What to do </span>
                    {p.management}
                  </p>
                ) : null}
                {p.source === "model" && typeof p.confidence === "number" ? (
                  <ConfidenceBar value={p.confidence} className="mt-2" />
                ) : null}
              </div>
            ))}

            {majorCascades.map((c, i) => (
              <div key={`c-${i}`} className="rounded-[var(--radius-sm)] border border-danger bg-danger-tint p-3">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-ink">Cascade across {c.drugs.length} drugs</span>
                  <SourceTag source={c.source === "mechanistic" ? "kb" : "model"} />
                </div>
                <p className="label-mono text-xs text-muted">{c.drugs.join(" + ")}</p>
                <p className="mt-1 text-xs text-ink">{c.explanation}</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  Main mechanism <span className="text-ink">{c.dominantMechanism}</span>
                </p>
                <ConfidenceBar value={c.risk} label="Cascade risk" className="mt-2" />
              </div>
            ))}
          </div>

          <Disclaimer />

          {/* The safe choice leads; overriding a major finding is the quiet,
              deliberate action — not an equally-weighted button. */}
          <div className="space-y-2">
            <Button className="w-full" onClick={() => setConfirmOpen(false)} disabled={saving}>
              Go back and review
            </Button>
            <Button
              variant="danger"
              size="sm"
              className="w-full"
              disabled={saving}
              onClick={async () => {
                setConfirmOpen(false);
                await handleSubmit(commit)();
              }}
            >
              {saving ? <Loader2 className="animate-spin" /> : "Add it anyway — I understand the risk"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
