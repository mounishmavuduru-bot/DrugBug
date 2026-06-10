"use client";

import { Phone, AlertTriangle, Flag, CircleSlash, Check } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { recoveryGuidance } from "@/lib/missed-dose";
import { DecisionSupportNote } from "@/components/today/disclaimer";
import { pharmacyPhone, type Medication } from "@/components/today/today-utils";

/**
 * Missed-Dose Recovery (PRD §9.2). Deterministic, drug-class-specific guidance
 * from `recoveryGuidance`. Always offers a one-tap "Call pharmacist" action;
 * uses the med's pharmacy phone when we can parse one, else a generic prompt.
 */
export function MissedDoseModal({
  open,
  onClose,
  med,
  onSkipConfirmed,
}: {
  open: boolean;
  onClose: () => void;
  med?: Medication;
  /** Called when the user confirms skipping the dose. */
  onSkipConfirmed: () => void;
}) {
  if (!open) return null;

  const guidance = recoveryGuidance({
    genericName: med?.genericName,
    name: med?.name,
  });

  const phone = pharmacyPhone(med?.pharmacy);
  const callHref = phone ? `tel:${phone}` : "tel:";

  return (
    <Modal open={open} onClose={onClose} title="Missed-dose recovery">
      <div className="space-y-4">
        <div>
          {med ? (
            <p className="mono text-sm text-text">
              {med.name}
              {med.strength ? (
                <span className="text-muted"> · {med.strength}</span>
              ) : null}
            </p>
          ) : null}
          <p className="mt-0.5 text-sm font-medium text-text">{guidance.title}</p>
        </div>

        <ol className="space-y-2">
          {guidance.steps.map((step, i) => (
            <li key={i} className="flex gap-2.5 text-sm text-text">
              <span className="mono mt-px grid size-5 shrink-0 place-items-center rounded-full bg-elevated text-[11px] text-muted">
                {i + 1}
              </span>
              <span className="leading-snug">{step}</span>
            </li>
          ))}
        </ol>

        <div className="space-y-2">
          {guidance.neverDouble ? (
            <div className="flex items-start gap-2 rounded-[var(--radius)] border border-danger/30 bg-danger/10 p-2.5 text-xs text-danger">
              <CircleSlash className="mt-px size-4 shrink-0" />
              <span>Never take a double dose to make up for a missed one.</span>
            </div>
          ) : null}
          {guidance.flagPrescriber ? (
            <div className="flex items-start gap-2 rounded-[var(--radius)] border border-warning/30 bg-warning/10 p-2.5 text-xs text-warning">
              <Flag className="mt-px size-4 shrink-0" />
              <span>Log this for your prescriber to review.</span>
            </div>
          ) : null}
        </div>

        <div className="rounded-[var(--radius)] border border-border bg-elevated/40 p-2.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-text">
            <AlertTriangle className="size-3.5 text-primary" />
            If unsure, call your pharmacist.
          </div>
          <a href={callHref} className="mt-2 block">
            <Button variant="secondary" size="sm" className="w-full">
              <Phone className="size-4" />
              Call pharmacist{phone ? "" : " (find number)"}
            </Button>
          </a>
        </div>

        <DecisionSupportNote />

        <div className="flex gap-2 pt-1">
          <Button variant="ghost" size="md" className="flex-1" onClick={onClose}>
            Back
          </Button>
          <Button
            variant="outline"
            size="md"
            className="flex-1"
            onClick={onSkipConfirmed}
          >
            <Check className="size-4" />
            Confirm skip
          </Button>
        </div>
      </div>
    </Modal>
  );
}
