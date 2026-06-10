"use client";

import { useEffect, useMemo, useState } from "react";
import { Save, Loader2, AlertTriangle, Check, Copy } from "lucide-react";
import { useReducer } from "spacetimedb/react";
import { Identity } from "spacetimedb";

import { reducers, identityHex } from "@/lib/db";
import { tsToDate, toTs, dayLabel } from "@/lib/format";
import { useMyProfile } from "@/lib/hooks";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { TagInput } from "@/components/settings/tag-input";

// Derive the row type from the hook so it stays in sync with the bindings
// without depending on a non-public `Infer` export.
type Profile = NonNullable<ReturnType<typeof useMyProfile>["profile"]>;

/** YYYY-MM-DD for <input type="date"> from a Timestamp. */
function toDateInput(d: Date | null): string {
  if (!d) return "";
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function ProfileSection({
  me,
  profile,
}: {
  me: Identity;
  profile: Profile;
}) {
  const updateProfile = useReducer(reducers.updateProfile);

  const dobDate = useMemo(() => tsToDate(profile.dateOfBirth), [profile.dateOfBirth]);
  const createdDate = useMemo(() => tsToDate(profile.createdAt), [profile.createdAt]);

  const [fullName, setFullName] = useState(profile.fullName);
  const [dob, setDob] = useState(toDateInput(dobDate));
  const [weight, setWeight] = useState(profile.weightKg ? String(profile.weightKg) : "");
  const [conditions, setConditions] = useState<string[]>(profile.conditions);
  const [allergies, setAllergies] = useState<string[]>(profile.allergies);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const hex = identityHex(me);

  // Re-sync local form when a realtime profile update arrives (e.g. from a
  // caregiver editing, or the service writing back).
  useEffect(() => {
    setFullName(profile.fullName);
    setDob(toDateInput(tsToDate(profile.dateOfBirth)));
    setWeight(profile.weightKg ? String(profile.weightKg) : "");
    setConditions(profile.conditions);
    setAllergies(profile.allergies);
  }, [profile]);

  const dirty =
    fullName !== profile.fullName ||
    dob !== toDateInput(dobDate) ||
    (weight === "" ? 0 : Number(weight)) !== profile.weightKg ||
    JSON.stringify(conditions) !== JSON.stringify(profile.conditions) ||
    JSON.stringify(allergies) !== JSON.stringify(profile.allergies);

  // Inline validation, evaluated as you type.
  const nameError = fullName.trim() === "" ? "Enter your name." : null;
  const weightError =
    weight !== "" && (Number.isNaN(Number(weight)) || Number(weight) < 0)
      ? "Weight must be a positive number."
      : null;
  const canSave = dirty && !nameError && !weightError && !saving;

  async function handleSave() {
    if (nameError || weightError) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      // dateOfBirth is a Timestamp; parse the date input as a local-noon date to
      // avoid timezone day-shift, fall back to the existing value if cleared.
      const parsedDob = dob ? new Date(`${dob}T12:00:00`) : dobDate ?? new Date();
      const weightKg = weight === "" ? 0 : Number(weight);
      if (Number.isNaN(weightKg)) throw new Error("Weight must be a number.");

      await updateProfile({
        owner: me,
        fullName: fullName.trim(),
        dateOfBirth: toTs(parsedDob),
        weightKg,
        conditions,
        allergies,
      });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your profile. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function copyHex() {
    try {
      await navigator.clipboard.writeText(hex);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — non-fatal */
    }
  }

  return (
    <section className="space-y-3" aria-labelledby="profile-heading">
      <h2
        id="profile-heading"
        className="label-mono px-1 text-[11px] uppercase tracking-[0.14em] text-muted"
      >
        Profile
      </h2>

      <Card className="space-y-4 p-4">
        <div>
          <Label htmlFor="fullName">Full name</Label>
          <Input
            id="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your name"
            autoComplete="name"
            disabled={saving}
            aria-invalid={!!nameError}
          />
          {nameError ? (
            <p className="mt-1.5 text-xs text-danger">{nameError}</p>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="dob">Date of birth</Label>
            <Input
              id="dob"
              type="date"
              value={dob}
              max={toDateInput(new Date())}
              onChange={(e) => setDob(e.target.value)}
              disabled={saving}
            />
          </div>
          <div>
            <Label htmlFor="weight">Weight (kg)</Label>
            <Input
              id="weight"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.1"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="e.g. 72.5"
              disabled={saving}
              aria-invalid={!!weightError}
            />
            {weightError ? (
              <p className="mt-1.5 text-xs text-danger">{weightError}</p>
            ) : null}
          </div>
        </div>

        <TagInput
          id="conditions"
          label="Conditions"
          values={conditions}
          onChange={setConditions}
          placeholder="Add a condition (e.g. hypertension)"
          disabled={saving}
        />

        <TagInput
          id="allergies"
          label="Allergies"
          values={allergies}
          onChange={setAllergies}
          placeholder="Add an allergy (e.g. penicillin)"
          disabled={saving}
          emptyHint="Drug and other allergies. Press Enter or comma to add."
        />

        {error ? (
          <p className="flex items-center gap-2 text-sm text-danger" role="alert">
            <AlertTriangle className="size-4 shrink-0" strokeWidth={1.75} /> {error}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-2 border-t border-rule pt-3">
          <p className="text-xs text-muted">
            {saved && !dirty ? (
              <span className="flex items-center gap-1 text-positive">
                <Check className="size-3.5" strokeWidth={2} /> Saved
              </span>
            ) : (
              "Stored encrypted. Used to check your doses and interactions."
            )}
          </p>
          <Button onClick={handleSave} disabled={!canSave} size="sm">
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Saving
              </>
            ) : (
              <>
                <Save className="size-4" /> Save changes
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Read-only account facts. */}
      <Card className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Label className="mb-1">Identity</Label>
            <p className="label-mono break-all text-xs text-muted" title={hex}>
              {hex}
            </p>
            <p className="mt-1.5 text-xs text-faint">
              Your account address. Read-only — share it to link a caregiver.
            </p>
          </div>
          <Button
            variant="quiet"
            size="icon"
            onClick={copyHex}
            aria-label="Copy identity"
            className="shrink-0"
          >
            {copied ? (
              <Check className="size-4 text-positive" strokeWidth={2} />
            ) : (
              <Copy className="size-4" />
            )}
          </Button>
        </div>
        <p className="border-t border-rule pt-3 text-xs text-faint">
          Account created {createdDate ? dayLabel(createdDate) : "—"}.
        </p>
      </Card>
    </section>
  );
}
