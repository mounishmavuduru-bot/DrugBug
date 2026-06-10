"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Lock,
  Dna,
  ShieldCheck,
  Info,
  LogOut,
  Loader2,
  ChevronRight,
} from "lucide-react";

import { clearToken } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

/**
 * Privacy & data (PRD §15/§16): a link into PharmacoFit consent, a plain-language
 * note on PHI encryption + the decision-support posture, and Sign out (clears the
 * persisted token and reloads so the next connect starts a fresh session).
 */
export function PrivacySection() {
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  function handleSignOut() {
    setSigningOut(true);
    clearToken();
    // Reload so the connection provider rebuilds without the persisted token.
    window.location.reload();
  }

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
        <Lock className="size-3.5" /> Privacy &amp; data
      </h2>

      <Card className="divide-y divide-border p-0">
        <Link
          href="/pharmacofit"
          className="flex items-center gap-3 p-4 transition-fast hover:bg-elevated"
        >
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-elevated text-primary">
            <Dna className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-text">PharmacoFit consent</p>
            <p className="text-xs text-muted">
              Review or revoke consent for pharmacogenomic processing of your DNA.
            </p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted" />
        </Link>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-elevated text-muted">
            <ShieldCheck className="size-4" />
          </div>
          <div>
            <p className="text-sm font-medium text-text">How your data is protected</p>
            <p className="mt-1 text-xs leading-snug text-muted">
              Medication, dose, side-effect, scan, and genomic data are treated as
              protected health information — encrypted at rest, with field-level
              encryption for genomic and pharmacogenomic data, and TLS in transit
              everywhere. Genomic data is never sold or shared and is deletable on
              request (PRD §15).
            </p>
          </div>
        </div>
        <p className="flex items-start gap-2 rounded-[var(--radius)] bg-elevated px-3 py-2 text-[11px] leading-snug text-muted">
          <Info className="mt-px size-3.5 shrink-0" />
          DrugBug provides decision-support only — it does not diagnose disease or
          replace a pharmacist or prescriber. Every clinical-adjacent output is shown
          with its confidence and the reminder to confirm with a professional.
        </p>
      </Card>

      <Button variant="outline" className="w-full" onClick={() => setSignOutOpen(true)}>
        <LogOut className="size-4" /> Sign out
      </Button>

      <Modal
        open={signOutOpen}
        onClose={() => (signingOut ? null : setSignOutOpen(false))}
        title="Sign out?"
      >
        <div className="space-y-4">
          <p className="text-sm leading-snug text-muted">
            Signing out clears this device’s session token. Your data stays safe in
            the cloud and syncs back when you sign in again.
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setSignOutOpen(false)}
              disabled={signingOut}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              {signingOut ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Signing out…
                </>
              ) : (
                <>
                  <LogOut className="size-4" /> Sign out
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
