"use client";

import { useState } from "react";
import { ShieldCheck, Loader2, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Granular, explicit PGx consent screen. Spells out exactly what is processed,
 * that genomic data is never sold or shared, that it is encrypted at rest, and
 * that consent is revocable. Continue calls setPgxConsent({ consent: true });
 * the screen does not proceed to upload until the profile reflects consent via
 * the realtime subscription.
 *
 * Rendered as a single ruled "terms" data sheet rather than a grid of identical
 * icon-tile cards, so the four points read as one document the user is agreeing
 * to, not four marketing features.
 */

const TERMS = [
  {
    label: "What we process",
    body: "We convert your 23andMe or AncestryDNA raw genotype file to a VCF and run PharmCAT to call CPIC star-allele diplotypes. Only the derived phenotypes (for example, your CYP2D6 metabolizer status) are kept on your profile.",
  },
  {
    label: "How it is protected",
    body: "Genomic data and the derived phenotypes are encrypted at rest and sent over TLS. They are used to match your medications against pharmacogenomic guidance, and nothing else.",
  },
  {
    label: "Never sold or shared",
    body: "Your genetic data is not sold, not shared with third parties, and not used for advertising or research without a separate, explicit opt-in.",
  },
  {
    label: "Revocable and deletable",
    body: "You can revoke consent at any time. Revoking clears the derived phenotypes, and you can request deletion of your raw genotype file.",
  },
] as const;

export function ConsentGate({ onConsent }: { onConsent: () => Promise<void> }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleContinue() {
    setSubmitting(true);
    setError(null);
    try {
      await onConsent();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "We couldn't save your consent. Try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[var(--radius-md)] border border-rule bg-card">
        <div className="flex items-start gap-3 border-b border-rule px-4 py-3.5">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
          <div>
            <h2 className="font-display text-lg text-ink">
              Consent to pharmacogenomic processing
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              This is sensitive genetic data, so we ask for your explicit consent
              before processing it. Read what happens to your file below, then
              continue if you agree.
            </p>
          </div>
        </div>

        <dl className="divide-y divide-rule">
          {TERMS.map(({ label, body }) => (
            <div key={label} className="px-4 py-3.5">
              <dt className="label-mono text-[11px] uppercase tracking-[0.12em] text-faint">
                {label}
              </dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-ink">{body}</dd>
            </div>
          ))}
        </dl>
      </section>

      {error ? (
        <p className="flex items-start gap-1.5 text-sm text-danger" role="alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
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
              <Loader2 className="animate-spin" /> Saving consent
            </>
          ) : (
            <>
              <ShieldCheck /> I consent — continue
            </>
          )}
        </Button>
        <p className="text-center text-xs leading-relaxed text-muted">
          Continuing confirms you understand the terms above and consent to
          pharmacogenomic processing of the genotype file you upload. You can
          revoke this at any time from this screen.
        </p>
      </div>
    </div>
  );
}
