"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useReducer } from "spacetimedb/react";
import { reducers } from "@/lib/db";
import { useConnected, useMyProfile } from "@/lib/hooks";
import { toTs } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { LoadingState, ErrorState } from "@/components/shared/states";
import { Wordmark } from "@/components/app/nav";

/**
 * Real onboarding (PRD §4): the user creates their own account/profile. No
 * seeded demo data. On success the (app) gate lets them through to /today.
 * Data wiring (useConnected, useMyProfile, createProfile, toTs, router) is
 * unchanged — this file is a visual/UX/copy reskin only.
 */
export default function WelcomePage() {
  const router = useRouter();
  const connected = useConnected();
  const { profile, ready } = useMyProfile();
  const createProfile = useReducer(reducers.createProfile);

  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [weight, setWeight] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; dob?: string; weight?: string }>({});

  // The connection is the data dependency here. If it never comes up, show an
  // error with a real retry instead of spinning forever (anti-vibe rule 8).
  const linkUp = connected && ready;
  const [connectTimedOut, setConnectTimedOut] = useState(false);
  useEffect(() => {
    if (linkUp) {
      setConnectTimedOut(false);
      return;
    }
    const t = setTimeout(() => setConnectTimedOut(true), 8000);
    return () => clearTimeout(t);
  }, [linkUp]);

  // Once a profile exists, the account is set up — go to the schedule.
  useEffect(() => {
    if (profile) router.replace("/today");
  }, [profile, router]);

  const today = new Date().toISOString().slice(0, 10);
  const openedOn = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  function validate(): boolean {
    const next: { name?: string; dob?: string; weight?: string } = {};
    if (!fullName.trim()) {
      next.name = "Enter the name on your prescriptions.";
    }
    if (!dob) {
      next.dob = "Date of birth is used for dose checks.";
    } else if (dob > today) {
      next.dob = "Date of birth can't be in the future.";
    }
    if (weight) {
      const w = Number(weight);
      if (!Number.isFinite(w) || w <= 0) {
        next.weight = "Enter a weight in kilograms, or leave it blank.";
      } else if (w > 500) {
        next.weight = "That weight looks too high. Check the value.";
      }
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!validate()) return;
    setBusy(true);
    try {
      await createProfile({
        fullName: fullName.trim(),
        dateOfBirth: toTs(new Date(dob)),
        weightKg: weight ? Number(weight) : 0,
        conditions: [],
        allergies: [],
      });
      // Success: the useMyProfile subscription will deliver the new row and the
      // effect above redirects to /today. Show confirmation while that lands.
      setDone(true);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Could not create your account. Try again."
      );
      setBusy(false);
    }
  }

  // Connection lost / never established — error state for the data view.
  if (!linkUp && connectTimedOut) {
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <div className="w-full max-w-sm space-y-6">
          <Wordmark className="justify-center" />
          <ErrorState
            title="Can't reach the record"
            description="We couldn't connect to the DrugBug server. Check your network and try again."
            retry={() => window.location.reload()}
          />
        </div>
      </main>
    );
  }

  // Connecting, or a profile exists and we're about to redirect — loading state.
  if (!linkUp || profile) {
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <div className="w-full max-w-sm space-y-6">
          <Wordmark className="justify-center" />
          <LoadingState rows={3} label="Connecting to your record…" />
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <header className="border-b border-rule-strong pb-6">
        <div className="flex items-center justify-between gap-3 border-b border-rule pb-3">
          <Wordmark />
          <p className="label-mono text-[10px] uppercase tracking-[0.14em] text-faint">
            New record
          </p>
        </div>
        <h1 className="mt-5 font-display text-[2rem] leading-[1.15] tracking-[-0.01em] text-ink">
          Start your medication{" "}
          <span className="whitespace-nowrap border-b-[3px] border-brand">record</span>
        </h1>
        <p className="mt-3 max-w-[34ch] text-[15px] leading-relaxed text-muted">
          DrugBug holds every medication you take in one place and checks a new one
          against the rest before you start it.
        </p>
        <p className="label-mono mt-4 text-[11px] tracking-[0.04em] text-faint">
          Opened {openedOn} · Private to you until you invite a caregiver
        </p>
      </header>

      <form onSubmit={submit} className="mt-7 space-y-5" noValidate>
        <fieldset disabled={busy || done} className="divide-y divide-rule border-y border-rule">
          <div className="py-4 first:pt-0">
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              value={fullName}
              autoComplete="name"
              autoFocus
              aria-invalid={fieldErrors.name ? true : undefined}
              aria-describedby={fieldErrors.name ? "name-err" : undefined}
              onChange={(e) => {
                setFullName(e.target.value);
                if (fieldErrors.name) setFieldErrors((p) => ({ ...p, name: undefined }));
              }}
            />
            {fieldErrors.name ? (
              <p id="name-err" className="mt-1.5 text-xs text-danger">
                {fieldErrors.name}
              </p>
            ) : null}
          </div>

          <div className="py-4">
            <Label htmlFor="dob">Date of birth</Label>
            <Input
              id="dob"
              type="date"
              value={dob}
              max={today}
              autoComplete="bday"
              aria-invalid={fieldErrors.dob ? true : undefined}
              aria-describedby={fieldErrors.dob ? "dob-err" : undefined}
              onChange={(e) => {
                setDob(e.target.value);
                if (fieldErrors.dob) setFieldErrors((p) => ({ ...p, dob: undefined }));
              }}
            />
            {fieldErrors.dob ? (
              <p id="dob-err" className="mt-1.5 text-xs text-danger">
                {fieldErrors.dob}
              </p>
            ) : null}
          </div>

          <div className="py-4 last:pb-0">
            <Label htmlFor="weight">Weight in kilograms</Label>
            <Input
              id="weight"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.1"
              placeholder="Optional"
              value={weight}
              className="label-mono"
              aria-invalid={fieldErrors.weight ? true : undefined}
              aria-describedby={
                fieldErrors.weight ? "weight-err" : "weight-hint"
              }
              onChange={(e) => {
                setWeight(e.target.value);
                if (fieldErrors.weight) setFieldErrors((p) => ({ ...p, weight: undefined }));
              }}
            />
            {fieldErrors.weight ? (
              <p id="weight-err" className="mt-1.5 text-xs text-danger">
                {fieldErrors.weight}
              </p>
            ) : (
              <p id="weight-hint" className="mt-1.5 text-xs text-faint">
                Used for weight-based dose checks. You can add it later.
              </p>
            )}
          </div>
        </fieldset>

        {formError ? (
          <p className="rounded-[var(--radius-sm)] border border-rule bg-danger-tint px-3 py-2 text-sm text-danger" role="alert">
            {formError}
          </p>
        ) : null}
        {done && !formError ? (
          <p className="rounded-[var(--radius-sm)] border border-rule bg-positive-tint px-3 py-2 text-sm text-positive" role="status">
            Account created. Opening your schedule…
          </p>
        ) : null}

        <Button type="submit" size="lg" variant="primary" className="w-full" disabled={busy || done}>
          {busy ? "Creating your account…" : done ? "Opening…" : "Create account"}
        </Button>
      </form>

      <p className="mt-6 border-t border-rule pt-4 text-xs leading-relaxed text-muted">
        Decision support, not a diagnosis — confirm with your pharmacist or prescriber.
        You can add or change any of this later in Settings.
      </p>
    </main>
  );
}
