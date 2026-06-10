"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck, Info, LogOut, Loader2, ChevronRight } from "lucide-react";

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
    <section className="space-y-3" aria-labelledby="privacy-heading">
      <h2
        id="privacy-heading"
        className="label-mono px-1 text-[11px] uppercase tracking-[0.14em] text-faint"
      >
        Privacy and data
      </h2>

      <Card className="p-0">
        <Link
          href="/pharmacofit"
          className="flex items-center gap-3 px-4 py-3.5 transition-colors duration-150 ease-[var(--ease)] hover:bg-brand-tint focus-visible:bg-brand-tint"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">Pharmacogenomic consent</p>
            <p className="mt-0.5 text-xs text-muted">
              Review or revoke consent to process your DNA for medication matching.
            </p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-faint" strokeWidth={1.75} aria-hidden />
        </Link>
      </Card>

      <Card className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted" strokeWidth={1.75} aria-hidden />
          <div>
            <p className="text-sm font-medium text-ink">How your data is protected</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Your medications, doses, side effects, scans, and genomic data are
              treated as protected health information: encrypted at rest, with
              field-level encryption for genomic and pharmacogenomic data, and TLS
              in transit. Genomic data is never sold or shared, and you can delete
              it on request (PRD §15).
            </p>
          </div>
        </div>
        <p className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-rule bg-surface px-3 py-2 text-xs leading-relaxed text-muted">
          <Info className="mt-px size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
          Decision support, not a diagnosis — confirm with your pharmacist or
          prescriber. DrugBug shows the confidence behind each clinical result and
          does not replace a professional.
        </p>
      </Card>

      <Button variant="secondary" className="w-full" onClick={() => setSignOutOpen(true)}>
        <LogOut className="size-4" /> Sign out
      </Button>

      <Modal
        open={signOutOpen}
        onClose={() => (signingOut ? null : setSignOutOpen(false))}
        title="Sign out?"
      >
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-muted">
            This clears the session on this device. Your data stays in the cloud and
            syncs back when you sign in again.
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
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
                  <Loader2 className="size-4 animate-spin" /> Signing out
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
