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
      <header className="space-y-4 border-b border-rule-strong pb-5">
        <Link
          href="/insights"
          className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-3.5" /> Back to your record
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="label-mono text-[11px] uppercase tracking-[0.14em] text-faint">
              For your visit
            </p>
            <h1 className="mt-1">Appointment brief</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
              A one-page summary of your medications, on-time rate, and logged effects you can print
              or hand to your provider.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setFormOpen(true)}
            className="shrink-0"
            disabled={!me}
          >
            <CalendarPlus className="size-4" /> Add appointment
          </Button>
        </div>
      </header>

      {!ready ? (
        <LoadingState rows={3} label="Loading appointments…" />
      ) : ordered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No appointments yet"
          description="Add an appointment, then generate a brief from it to bring to your provider."
          action={
            <Button variant="primary" onClick={() => setFormOpen(true)} disabled={!me}>
              <CalendarPlus className="size-4" /> Add appointment
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

      <div className="rounded-[var(--radius-md)] border border-rule bg-surface p-4 print:hidden">
        <p className="text-sm leading-relaxed text-muted">
          A brief is built only from data you've logged: your current medications, 30-day on-time
          rate, side effects with their statistical associations, detected interactions, and refill
          problems. It doesn't add anything you didn't record.
        </p>
        <Disclaimer className="mt-2" />
      </div>

      <AppointmentForm open={formOpen} onClose={() => setFormOpen(false)} owner={me} />
    </div>
  );
}
