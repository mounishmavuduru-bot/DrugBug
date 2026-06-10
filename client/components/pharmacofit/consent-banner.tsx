"use client";

import { ShieldCheck } from "lucide-react";

/**
 * Shown once consent is on file. A quiet ruled banner (not a glowing card)
 * restating the privacy terms the user agreed to, with the revoke action living
 * in the page header. Tone is the earthy "positive" signal, used for meaning.
 */
export function ConsentBanner() {
  return (
    <div className="flex items-start gap-2.5 rounded-[var(--radius-md)] border border-rule bg-positive-tint px-4 py-3">
      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-positive" aria-hidden />
      <p className="text-sm leading-relaxed text-ink">
        Consent is on file. Your genotype file and the phenotypes we derive from
        it are encrypted and used only to match your medications. Revoke any time
        from the button above.
      </p>
    </div>
  );
}
