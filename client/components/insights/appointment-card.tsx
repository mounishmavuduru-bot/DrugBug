"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarClock, FileText, FilePlus, RefreshCw } from "lucide-react";
import { Identity } from "spacetimedb";
import { useReducer } from "spacetimedb/react";
import { reducers, identityHex } from "@/lib/db";
import { tsToDate, dayLabel, clockTime } from "@/lib/format";
import { generateBrief } from "@/lib/inference-client";
import type { Appointment } from "@/lib/spacetime/types";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/shared/states";
import { BriefCard } from "@/components/insights/brief-card";
import { briefStateFromRef } from "@/components/insights/insights-utils";

/**
 * One appointment row (PRD §10.5). Triggers brief generation; the resulting
 * `briefRef` is written back by the Inference Service via `attach_brief` and
 * arrives through the useAppointments() subscription — so we just watch the row.
 * A short safety-net poll covers cases where the writeback lags or the service
 * returns the ref synchronously.
 */
export function AppointmentCard({
  appt,
  owner,
}: {
  appt: Appointment;
  owner: Identity | undefined;
}) {
  const attachBrief = useReducer(reducers.attachBrief);

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const when = tsToDate(appt.scheduledFor);
  const providerLabel = [appt.providerName, appt.providerType].filter(Boolean).join(" · ");
  const briefState = briefStateFromRef(appt.briefRef);
  const hasBrief = briefState.kind === "ready";

  useEffect(
    () => () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    },
    []
  );

  const handleGenerate = useCallback(async () => {
    if (!owner) {
      setError("Not connected yet — try again in a moment.");
      return;
    }
    setError(null);
    setGenerating(true);
    try {
      const { briefRef } = await generateBrief({
        identityHex: identityHex(owner),
        apptId: appt.apptId,
        providerType: appt.providerType || undefined,
      });
      // If the service returns a usable ref synchronously and the writeback hasn't
      // landed yet, persist it ourselves so the brief shows immediately.
      const synchronous = briefStateFromRef(briefRef);
      if (synchronous.kind === "ready") {
        try {
          await attachBrief({ apptId: appt.apptId, briefRef });
        } catch {
          // Writeback may already have happened service-side; the subscription wins.
        }
      }
      // Safety-net: clear the spinner if nothing arrives within the poll window.
      pollTimer.current = setTimeout(() => setGenerating(false), 20_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate the brief.");
      setGenerating(false);
    }
  }, [owner, appt.apptId, appt.providerType, attachBrief]);

  // Derived so the spinner clears as soon as the brief row arrives (no effect
  // needed): once a brief is ready we never show "generating".
  const showGenerating = !hasBrief && (generating || briefState.kind === "generating");

  return (
    <Card>
      <div className="px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-brand-tint text-brand">
              <CalendarClock className="size-4" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-medium text-ink">
                {appt.providerName || appt.providerType || "Appointment"}
              </p>
              <p className="text-xs text-muted">
                {appt.providerType && appt.providerName ? `${appt.providerType} · ` : ""}
                {when ? `${dayLabel(when)} · ${clockTime(when)}` : "No date set"}
              </p>
            </div>
          </div>
          {hasBrief ? (
            <Badge variant="positive" className="shrink-0">
              <FileText className="size-3" aria-hidden /> Brief ready
            </Badge>
          ) : null}
        </div>

        <div className="mt-3 flex items-center gap-2 print:hidden">
          {showGenerating ? (
            <Button variant="secondary" size="sm" disabled>
              <RefreshCw className="size-4 animate-spin" /> Generating brief…
            </Button>
          ) : (
            <Button variant={hasBrief ? "secondary" : "primary"} size="sm" onClick={handleGenerate}>
              <FilePlus className="size-4" />
              {hasBrief ? "Regenerate brief" : "Generate brief"}
            </Button>
          )}
        </div>

        {error ? (
          <ErrorState
            title="Couldn't generate the brief"
            description={error}
            retry={handleGenerate}
            className="mt-3"
          />
        ) : null}
      </div>

      {(hasBrief || briefState.kind === "generating") && !error ? (
        <div className="border-t border-rule p-4">
          <BriefCard
            briefRef={showGenerating && !hasBrief ? "generating" : appt.briefRef}
            providerLabel={providerLabel}
          />
        </div>
      ) : null}
    </Card>
  );
}
