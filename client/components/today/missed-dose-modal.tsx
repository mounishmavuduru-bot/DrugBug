"use client";

import { Phone, Flag, CircleSlash, Check } from "lucide-react";
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
    <Modal open={open} onClose={onClose} title="Before you skip this dose">
      <div className="space-y-5">
        <div className="border-b border-rule pb-4">
          {med ? (
            <p className="label-mono text-sm text-ink">
              {med.name}
              {med.strength ? (
                <span className="text-muted"> · {med.strength}</span>
              ) : null}
            </p>
          ) : null}
          <p className="mt-1 text-sm font-medium text-ink">{guidance.title}</p>
        </div>

        <ol className="space-y-2.5">
          {guidance.steps.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm text-ink">
              <span className="label-mono tnum mt-px grid size-5 shrink-0 place-items-center rounded-[var(--radius-sharp)] border border-rule-strong bg-surface text-[11px] text-muted">
                {i + 1}
              </span>
              <span className="leading-snug">{step}</span>
            </li>
          ))}
        </ol>

        <div className="space-y-2">
          {guidance.neverDouble ? (
            <div className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-rule bg-danger-tint p-2.5 text-xs text-danger">
              <CircleSlash className="mt-px size-4 shrink-0" strokeWidth={1.75} />
              <span>Do not take a double dose to make up for this one.</span>
            </div>
          ) : null}
          {guidance.flagPrescriber ? (
            <div className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-rule bg-monitor-tint p-2.5 text-xs text-monitor">
              <Flag className="mt-px size-4 shrink-0" strokeWidth={1.75} />
              <span>Note this for your prescriber to review.</span>
            </div>
          ) : null}
        </div>

        <div className="border-t border-rule pt-4">
          <p className="text-xs text-muted">
            Not sure what to do? Your pharmacist can answer in a minute.
          </p>
          <a href={callHref} className="mt-2 block">
            <Button variant="secondary" size="sm" className="w-full">
              <Phone className="size-4" strokeWidth={1.75} />
              Call pharmacist{phone ? "" : " (add a number first)"}
            </Button>
          </a>
        </div>

        <DecisionSupportNote />

        <div className="flex gap-2 border-t border-rule pt-4">
          <Button variant="quiet" size="md" className="flex-1" onClick={onClose}>
            Keep this dose
          </Button>
          <Button
            variant="secondary"
            size="md"
            className="flex-1"
            onClick={onSkipConfirmed}
          >
            <Check className="size-4" strokeWidth={1.75} />
            Confirm skip
          </Button>
        </div>
      </div>
    </Modal>
  );
}
