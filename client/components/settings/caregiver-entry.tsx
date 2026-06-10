"use client";

import Link from "next/link";
import { Users, ChevronRight } from "lucide-react";
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
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
        <Users className="size-3.5" /> Caregivers
      </h2>

      <Card className="p-0">
        <Link
          href="/caregiver"
          className="flex items-center gap-3 p-4 transition-fast hover:bg-elevated"
        >
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-elevated text-primary">
            <Users className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-text">Caregiver management</p>
            <p className="text-xs text-muted">
              Invite caregivers, manage access, or view people you help.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {patientCount > 0 ? (
              <Badge variant="primary">{patientCount} caring for you</Badge>
            ) : null}
            {caregiverCount > 0 ? (
              <Badge variant="neutral">{caregiverCount} you help</Badge>
            ) : null}
            <ChevronRight className="size-4 text-muted" />
          </div>
        </Link>
      </Card>
    </section>
  );
}
