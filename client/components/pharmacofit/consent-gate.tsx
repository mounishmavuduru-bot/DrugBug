"use client";

import { useState } from "react";
import {
  ShieldCheck,
  Lock,
  Database,
  Ban,
  RotateCcw,
  Loader2,
  AlertTriangle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Granular, explicit PGx consent screen (PRD §10.4 + §15). Spells out exactly
 * what is processed, that genomic data is never sold or shared, that it is
 * encrypted at rest, and that consent is revocable. Continue calls
 * setPgxConsent({ consent: true }); the screen does not proceed to upload until
 * the profile reflects consent via the realtime subscription.
 */

const PROCESSED = [
  {
    icon: Database,
    title: "What we process",
    body: "Your uploaded 23andMe / AncestryDNA raw genotype file is converted to a VCF and run through PharmCAT to call CPIC star-allele diplotypes. Only the derived pharmacogenomic phenotypes (e.g. CYP2D6 status) are stored on your profile.",
  },
  {
    icon: Lock,
    title: "How it is protected",
    body: "Genomic data and derived phenotypes are encrypted at rest and transmitted over TLS. They are used only to personalize medication risk for you — for nothing else.",
  },
  {
    icon: Ban,
    title: "Never sold or shared",
    body: "Your genetic data is never sold, never shared with third parties, and never used for advertising or research without separate, explicit opt-in.",
  },
  {
    icon: RotateCcw,
    title: "Revocable and deletable",
    body: "You can revoke consent at any time. Revoking clears your derived pharmacogenomic phenotypes, and your raw genotype file is deletable on request.",
  },
] as const;

export function ConsentGate({
  onConsent,
}: {
  onConsent: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleContinue() {
    setSubmitting(true);
    setError(null);
    try {
      await onConsent();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Couldn’t save your consent. Try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3 border-primary/30">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text">
              Consent to pharmacogenomic processing
            </h2>
            <p className="mt-1 text-xs leading-snug text-muted">
              PharmacoFit personalizes medication risk to your DNA. Because this
              is sensitive genetic data, we ask for your explicit consent first.
              Please read what happens to your data below.
            </p>
          </div>
        </div>
      </Card>

      <ul className="space-y-3">
        {PROCESSED.map(({ icon: Icon, title, body }) => (
          <li key={title}>
            <Card className="flex items-start gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-full bg-elevated text-muted">
                <Icon className="size-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-text">{title}</p>
                <p className="mt-1 text-xs leading-snug text-muted">{body}</p>
              </div>
            </Card>
          </li>
        ))}
      </ul>

      {error ? (
        <Card className="border-danger/40">
          <p className="flex items-center gap-2 text-sm text-danger">
            <AlertTriangle className="size-4 shrink-0" /> {error}
          </p>
        </Card>
      ) : null}

      <div className="space-y-2">
        <Button
          variant="primary"
          className="w-full"
          onClick={handleContinue}
          disabled={submitting}
        >
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Saving consent…
            </>
          ) : (
            <>
              <ShieldCheck className="size-4" /> I consent — continue
            </>
          )}
        </Button>
        <p className="text-center text-[11px] leading-snug text-muted">
          By continuing you confirm you understand the above and consent to
          pharmacogenomic processing of your uploaded genotype file. You can
          revoke this at any time from this screen.
        </p>
      </div>
    </div>
  );
}
