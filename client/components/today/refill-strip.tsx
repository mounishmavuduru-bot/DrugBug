"use client";

import { PackageOpen, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  daysOfSupply,
  pharmacyPhone,
  type Medication,
} from "@/components/today/today-utils";

/** Build a best-effort pharmacy deep-link (tel:) if we can parse a phone. */
function refillHref(med: Medication): string | null {
  const phone = pharmacyPhone(med.pharmacy);
  return phone ? `tel:${phone}` : null;
}

interface LowMed {
  med: Medication;
  days: number;
}

/**
 * Refill strip (PRD §9.1/§9.5). Any scheduled med whose remaining doses imply
 * < 7 days of supply shows a countdown + "Request refill" deep-link. No in-app
 * ordering — we only deep-link to the pharmacy when a number is on file.
 */
export function RefillStrip({ meds }: { meds: readonly Medication[] }) {
  const low: LowMed[] = meds
    .map((med) => ({ med, days: daysOfSupply(med) }))
    .filter((x): x is LowMed => x.days !== null && x.days < 7)
    .sort((a, b) => a.days - b.days);

  if (low.length === 0) return null;

  return (
    <section aria-label="Refills running low" className="space-y-3">
      <div className="flex items-center gap-2">
        <PackageOpen className="size-4 text-monitor" strokeWidth={1.75} aria-hidden />
        <h2 className="label-mono text-[11px] uppercase tracking-[0.16em] text-faint">
          Running low
        </h2>
      </div>
      <ul className="border-t border-rule-strong">
        {low.map(({ med, days }) => {
          const href = refillHref(med);
          return (
            <li
              key={med.medId.toString()}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-rule py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="label-mono truncate text-sm text-ink">{med.name}</p>
                <p className="label-mono truncate text-xs text-faint">
                  <span className="tnum">{med.dosesRemaining}</span> doses left
                  {med.pharmacy ? ` · ${med.pharmacy}` : ""}
                </p>
              </div>
              <Badge variant={days <= 2 ? "danger" : "caution"} className="shrink-0">
                {days <= 0
                  ? "Out today"
                  : days === 1
                    ? "1 day left"
                    : `${days} days of supply`}
              </Badge>
              {href ? (
                <a href={href} className="shrink-0">
                  <Button variant="secondary" size="sm">
                    <ExternalLink className="size-4" strokeWidth={1.75} aria-hidden />
                    Call to refill
                  </Button>
                </a>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled
                  title="No pharmacy number on file"
                >
                  Call to refill
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
