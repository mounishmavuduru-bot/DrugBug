"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useReducer } from "spacetimedb/react";
import { reducers } from "@/lib/db";
import { tsToDate, toTs } from "@/lib/format";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ScheduleBuilder, type ScheduleValue } from "@/components/med/schedule-builder";
import { FORM_OPTIONS, type Medication } from "@/components/med/med-utils";

/** Edit medication (PRD §9.3). Calls updateMedication({ medId, ...fields }). */
export function EditMedModal({
  open,
  onClose,
  med,
}: {
  open: boolean;
  onClose: () => void;
  med: Medication;
}) {
  const updateMedication = useReducer(reducers.updateMedication);

  const refill = tsToDate(med.refillDate);
  const [name, setName] = useState(med.name);
  const [strength, setStrength] = useState(med.strength);
  const [form, setForm] = useState(med.form || "tablet");
  const [prescriber, setPrescriber] = useState(med.prescriber);
  const [pharmacy, setPharmacy] = useState(med.pharmacy);
  const [ndc, setNdc] = useState(med.ndc);
  const [dosesRemaining, setDosesRemaining] = useState(String(med.dosesRemaining));
  const [refillDate, setRefillDate] = useState(refill ? toInputDate(refill) : "");
  const [isOtc, setIsOtc] = useState(med.isOtc);
  const [schedule, setSchedule] = useState<ScheduleValue>({
    times: [...med.scheduleTimes],
    days: Array.from(med.scheduleDays),
    prn: med.prn,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) return setError("Name is required.");
    if (!strength.trim()) return setError("Strength is required.");
    if (!schedule.prn && schedule.times.length === 0)
      return setError("Add at least one dose time, or mark as PRN.");
    setSaving(true);
    setError(null);
    try {
      await updateMedication({
        medId: med.medId,
        name: name.trim(),
        genericName: med.genericName,
        rxnormCode: med.rxnormCode,
        strength: strength.trim(),
        form,
        scheduleTimes: schedule.prn ? [] : schedule.times,
        scheduleDays: Uint8Array.from(schedule.prn ? [] : schedule.days),
        prn: schedule.prn,
        prescriber: prescriber.trim(),
        pharmacy: pharmacy.trim(),
        ndc: ndc.trim(),
        refillDate: refillDate ? toTs(new Date(`${refillDate}T00:00:00`)) : med.refillDate,
        dosesRemaining: Math.max(0, parseInt(dosesRemaining || "0", 10) || 0),
        isOtc,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update medication.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit medication">
      <div className="max-h-[70vh] space-y-4 overflow-auto pr-1">
        <div>
          <Label htmlFor="edit-name">Name</Label>
          <Input id="edit-name" className="mono" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="edit-strength">Strength</Label>
            <Input id="edit-strength" className="mono" value={strength} onChange={(e) => setStrength(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="edit-form">Form</Label>
            <select
              id="edit-form"
              value={form}
              onChange={(e) => setForm(e.target.value)}
              className="flex h-10 w-full rounded-[var(--radius)] border border-border bg-elevated px-3 text-sm text-text outline-none focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              {FORM_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <Label>Schedule</Label>
          <ScheduleBuilder value={schedule} onChange={setSchedule} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="edit-prescriber">Prescriber</Label>
            <Input id="edit-prescriber" value={prescriber} onChange={(e) => setPrescriber(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="edit-pharmacy">Pharmacy</Label>
            <Input id="edit-pharmacy" value={pharmacy} onChange={(e) => setPharmacy(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="edit-ndc">NDC</Label>
            <Input id="edit-ndc" className="mono" value={ndc} onChange={(e) => setNdc(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="edit-refill">Refill date</Label>
            <Input id="edit-refill" type="date" value={refillDate} onChange={(e) => setRefillDate(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="edit-doses">Doses remaining</Label>
            <Input
              id="edit-doses"
              type="number"
              min={0}
              className="mono"
              value={dosesRemaining}
              onChange={(e) => setDosesRemaining(e.target.value)}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-primary,#06B6D4)]"
            checked={isOtc}
            onChange={(e) => setIsOtc(e.target.checked)}
          />
          Over-the-counter
        </label>

        {error ? <p className="text-xs text-danger">{error}</p> : null}

        <div className="flex items-center gap-3">
          <Button variant="ghost" className="flex-1" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : "Save changes"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function toInputDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
