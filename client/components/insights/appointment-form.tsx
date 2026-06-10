"use client";

import { useState } from "react";
import { Identity } from "spacetimedb";
import { useReducer } from "spacetimedb/react";
import { reducers } from "@/lib/db";
import { toTs } from "@/lib/format";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";

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
      setError("Pick a date and time for the appointment.");
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
      setError(err instanceof Error ? err.message : "Could not save the appointment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="Add appointment">
      <form onSubmit={submit} className="space-y-4" noValidate>
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
          <Select
            id="appt-provider-type"
            value={providerType}
            onChange={(e) => setProviderType(e.target.value)}
          >
            {PROVIDER_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="appt-when">Date and time</Label>
          <Input
            id="appt-when"
            type="datetime-local"
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
            required
            aria-invalid={!!error && !scheduledFor}
          />
        </div>

        {error ? (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="quiet" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !owner}>
            {busy ? "Saving…" : "Save appointment"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
