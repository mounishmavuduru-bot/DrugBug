"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Entry point into CaregiverMode (PRD §10.6). Surfaces counts so the user sees
 * existing links at a glance, then deep-links to /caregiver to manage them.
 */
export function CaregiverEntry({
  patientCount,
  caregiverCount,
}: {
  patientCount: number;
  caregiverCount: number;
}) {
  return (
    <section className="space-y-3" aria-labelledby="caregivers-heading">
      <h2
        id="caregivers-heading"
        className="label-mono px-1 text-[11px] uppercase tracking-[0.14em] text-faint"
      >
        Caregivers
      </h2>

      <Card className="p-0">
        <Link
          href="/caregiver"
          className="flex items-center gap-3 px-4 py-3.5 transition-colors duration-150 ease-[var(--ease)] hover:bg-brand-tint focus-visible:bg-brand-tint"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">Caregiver access</p>
            <p className="mt-0.5 text-xs text-muted">
              Invite a caregiver, set what they can see, or view people you help.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {patientCount > 0 ? (
              <Badge variant="brand">
                <span className="tnum">{patientCount}</span> caring for you
              </Badge>
            ) : null}
            {caregiverCount > 0 ? (
              <Badge variant="neutral">
                <span className="tnum">{caregiverCount}</span> you help
              </Badge>
            ) : null}
            <ChevronRight className="size-4 text-faint" strokeWidth={1.75} aria-hidden />
          </div>
        </Link>
      </Card>
    </section>
  );
}
