"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useReducer } from "spacetimedb/react";
import { Identity } from "spacetimedb";
import { reducers } from "@/lib/db";
import { toTs } from "@/lib/format";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const SEVERITY: { value: number; label: string }[] = [
  { value: 1, label: "1 · Mild" },
  { value: 2, label: "2" },
  { value: 3, label: "3 · Moderate" },
  { value: 4, label: "4" },
  { value: 5, label: "5 · Severe" },
];

/**
 * Log a side effect for a specific medication (PRD §9.3 / §10.3). Calls
 * logSideEffect({ owner, medId, symptom, severity, loggedAt }).
 */
export function LogSideEffectModal({
  open,
  onClose,
  owner,
  medId,
  medName,
}: {
  open: boolean;
  onClose: () => void;
  owner: Identity;
  medId: bigint;
  medName: string;
}) {
  const logSideEffect = useReducer(reducers.logSideEffect);
  const [symptom, setSymptom] = useState("");
  const [severity, setSeverity] = useState(2);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setSymptom("");
    setSeverity(2);
    setNotes("");
    setError(null);
  };

  const submit = async () => {
    if (!symptom.trim()) {
      setError("Describe what you felt.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // `notes` is appended to the symptom string — the side_effects row has no
      // separate notes column (PRD §8). Severity drives attribution weighting.
      const symptomText = notes.trim() ? `${symptom.trim()} — ${notes.trim()}` : symptom.trim();
      await logSideEffect({
        owner,
        medId,
        symptom: symptomText,
        severity,
        loggedAt: toTs(new Date()),
      });
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Log a side effect">
      <div className="space-y-4">
        <p className="text-xs text-muted">
          For <span className="label-mono text-ink">{medName}</span>
        </p>

        <div>
          <Label htmlFor="se-symptom">Symptom</Label>
          <Input
            id="se-symptom"
            value={symptom}
            onChange={(e) => setSymptom(e.target.value)}
            placeholder="e.g. headache, nausea, dizziness"
          />
        </div>

        <div>
          <Label>Severity, 1 to 5</Label>
          <div className="flex flex-wrap gap-2">
            {SEVERITY.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setSeverity(s.value)}
                aria-pressed={severity === s.value}
                className={cn(
                  "rounded-[var(--radius-pill)] border px-3 py-1 text-xs font-medium transition-colors duration-150 ease-[var(--ease)]",
                  severity === s.value
                    ? "border-brand bg-brand text-brand-ink"
                    : "border-rule-strong bg-card text-muted hover:bg-brand-tint hover:text-ink"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label htmlFor="se-notes">Notes (optional)</Label>
          <Textarea
            id="se-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything else worth telling your prescriber."
          />
        </div>

        {error ? <p className="text-xs text-danger" role="alert">{error}</p> : null}

        <div className="flex items-center gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : "Save side effect"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
