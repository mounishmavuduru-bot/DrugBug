"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarPlus, FileText } from "lucide-react";

import { useMyIdentity, useAppointments } from "@/lib/hooks";
import { tsToDate } from "@/lib/format";

import { Button } from "@/components/ui/button";
import { LoadingState, EmptyState } from "@/components/shared/states";
import { Disclaimer } from "@/components/med/disclaimer";

import { AppointmentForm } from "@/components/insights/appointment-form";
import { AppointmentCard } from "@/components/insights/appointment-card";

export default function BriefPage() {
  const me = useMyIdentity();
  const { appointments, ready } = useAppointments();

  const [formOpen, setFormOpen] = useState(false);

  // Capture "now" once per mount (lazy ref init) so the sort comparator stays
  // pure across renders — calling Date.now() during render is non-idempotent.
  const nowRef = useRef<number | null>(null);
  if (nowRef.current === null) nowRef.current = Date.now();

  // Soonest upcoming first, then past appointments most-recent first.
  const ordered = useMemo(() => {
    const now = nowRef.current ?? Date.now();
    return [...appointments].sort((a, b) => {
      const ta = tsToDate(a.scheduledFor)?.getTime() ?? 0;
      const tb = tsToDate(b.scheduledFor)?.getTime() ?? 0;
      const aUpcoming = ta >= now;
      const bUpcoming = tb >= now;
      if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
      return aUpcoming ? ta - tb : tb - ta;
    });
  }, [appointments]);

  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <Link
          href="/insights"
          className="inline-flex items-center gap-1 text-xs text-muted transition-fast hover:text-text"
        >
          <ArrowLeft className="size-3.5" /> Insights
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Appointment prep</h1>
            <p className="text-xs text-muted">
              Generate a clinician-ready brief from your meds, adherence, and logged effects.
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => setFormOpen(true)}
            className="shrink-0"
            disabled={!me}
          >
            <CalendarPlus className="size-4" /> New appointment
          </Button>
        </div>
      </header>

      {!ready ? (
        <LoadingState label="Loading appointments…" />
      ) : ordered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No appointments yet"
          description="Add an appointment, then generate a one-page brief to bring to your provider."
          action={
            <Button variant="primary" onClick={() => setFormOpen(true)} disabled={!me}>
              <CalendarPlus className="size-4" /> New appointment
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {ordered.map((appt) => (
            <AppointmentCard key={appt.apptId.toString()} appt={appt} owner={me} />
          ))}
        </div>
      )}

      <div className="rounded-[var(--radius)] border border-border bg-elevated/30 p-3">
        <p className="text-xs leading-relaxed text-muted">
          Briefs are composed only from your logged data — current medications, 30-day
          adherence, side effects with statistical associations, detected interactions, and
          refill issues. They invent nothing and are meant to improve the conversation with
          your provider.
        </p>
        <Disclaimer className="mt-2" />
      </div>

      <AppointmentForm open={formOpen} onClose={() => setFormOpen(false)} owner={me} />
    </div>
  );
}
