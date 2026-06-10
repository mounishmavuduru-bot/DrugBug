"use client";

import { useState } from "react";
import { Identity } from "spacetimedb";
import { useReducer } from "spacetimedb/react";
import { reducers } from "@/lib/db";
import { toTs } from "@/lib/format";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

const PROVIDER_TYPES = [
  "Primary care",
  "Cardiologist",
  "Endocrinologist",
  "Psychiatrist",
  "Neurologist",
  "Pharmacist",
  "Specialist",
  "Other",
] as const;

/** Create-appointment form (PRD §10.5). Persists via the createAppointment reducer. */
export function AppointmentForm({
  open,
  onClose,
  owner,
}: {
  open: boolean;
  onClose: () => void;
  owner: Identity | undefined;
}) {
  const createAppointment = useReducer(reducers.createAppointment);

  const [providerName, setProviderName] = useState("");
  const [providerType, setProviderType] = useState<string>(PROVIDER_TYPES[0]);
  const [scheduledFor, setScheduledFor] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setProviderName("");
    setProviderType(PROVIDER_TYPES[0]);
    setScheduledFor("");
    setError(null);
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!owner) {
      setError("Not connected yet — try again in a moment.");
      return;
    }
    const when = scheduledFor ? new Date(scheduledFor) : null;
    if (!when || Number.isNaN(when.getTime())) {
      setError("Choose a valid date and time.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createAppointment({
        owner,
        providerName: providerName.trim() || providerType,
        providerType,
        scheduledFor: toTs(when),
      });
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the appointment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="New appointment">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="appt-provider-name">Provider name</Label>
          <Input
            id="appt-provider-name"
            value={providerName}
            onChange={(e) => setProviderName(e.target.value)}
            placeholder="Dr. Rivera"
            autoComplete="off"
          />
        </div>

        <div>
          <Label htmlFor="appt-provider-type">Provider type</Label>
          <select
            id="appt-provider-type"
            value={providerType}
            onChange={(e) => setProviderType(e.target.value)}
            className="flex h-10 w-full rounded-[var(--radius)] border border-border bg-elevated px-3 text-sm text-text outline-none transition-fast focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            {PROVIDER_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="appt-when">Date &amp; time</Label>
          <Input
            id="appt-when"
            type="datetime-local"
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
          />
        </div>

        {error ? <p className="text-xs text-danger">{error}</p> : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !owner}>
            {busy ? "Creating…" : "Create appointment"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
