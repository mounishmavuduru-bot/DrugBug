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
 * ordering — we only deep-link to the pharmacy when a number is known.
 */
export function RefillStrip({ meds }: { meds: readonly Medication[] }) {
  const low: LowMed[] = meds
    .map((med) => ({ med, days: daysOfSupply(med) }))
    .filter((x): x is LowMed => x.days !== null && x.days < 7)
    .sort((a, b) => a.days - b.days);

  if (low.length === 0) return null;

  return (
    <section aria-label="Refills due soon" className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <PackageOpen className="size-4 text-warning" />
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Refills due soon
        </h2>
      </div>
      <ul className="space-y-1.5">
        {low.map(({ med, days }) => {
          const href = refillHref(med);
          return (
            <li
              key={med.medId.toString()}
              className="surface flex items-center gap-3 rounded-[var(--radius)] border border-border p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="mono truncate text-sm text-text">{med.name}</p>
                <p className="mono truncate text-xs text-muted">
                  {med.dosesRemaining} doses left
                  {med.pharmacy ? ` · ${med.pharmacy}` : ""}
                </p>
              </div>
              <Badge variant={days <= 2 ? "danger" : "warning"} className="shrink-0">
                {days <= 0
                  ? "Out today"
                  : days === 1
                    ? "1 day left"
                    : `${days} days left`}
              </Badge>
              {href ? (
                <a href={href} className="shrink-0">
                  <Button variant="secondary" size="sm">
                    <ExternalLink className="size-4" />
                    Request refill
                  </Button>
                </a>
              ) : (
                <Button variant="secondary" size="sm" disabled title="No pharmacy contact on file">
                  Request refill
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
