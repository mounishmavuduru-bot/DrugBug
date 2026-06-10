"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pill } from "lucide-react";
import { useReducer } from "spacetimedb/react";
import { reducers } from "@/lib/db";
import { useConnected, useMyProfile } from "@/lib/hooks";
import { toTs } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { LoadingState } from "@/components/shared/states";

/**
 * Real onboarding (PRD §4): the user creates their own account/profile. No
 * seeded demo data. On success the (app) gate lets them through to /today.
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
  const [error, setError] = useState<string | null>(null);

  if (!connected || !ready) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <LoadingState label="Connecting…" />
      </div>
    );
  }
  if (profile) {
    router.replace("/today");
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fullName.trim() || !dob) {
      setError("Name and date of birth are required.");
      return;
    }
    setBusy(true);
    try {
      await createProfile({
        fullName: fullName.trim(),
        dateOfBirth: toTs(new Date(dob)),
        weightKg: weight ? Number(weight) : 0,
        conditions: [],
        allergies: [],
      });
      router.replace("/today");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create profile.");
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <div className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Pill className="size-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">DrugBug</span>
        </div>
        <h1 className="text-xl font-semibold">Create your account</h1>
        <p className="mt-1 text-sm text-muted">
          Your medication data is private to you. Add a caregiver later from Settings.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="name">Full name</Label>
            <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus />
          </div>
          <div>
            <Label htmlFor="dob">Date of birth</Label>
            <Input id="dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="weight">Weight (kg, optional)</Label>
            <Input
              id="weight"
              type="number"
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </div>
          {error ? <p className="text-xs text-danger">{error}</p> : null}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? "Creating…" : "Continue"}
          </Button>
        </form>
        <p className="mt-4 text-center text-[11px] text-muted">
          DrugBug is decision-support, not a diagnosis. Always confirm with your pharmacist or
          prescriber.
        </p>
      </div>
    </div>
  );
}
