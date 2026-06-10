"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Printer,
  Link as LinkIcon,
  Check,
  Loader2,
  FileText,
  ExternalLink,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingState, ErrorState } from "@/components/shared/states";
import { Disclaimer } from "@/components/med/disclaimer";
import { briefStateFromRef } from "@/components/insights/insights-utils";

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; text: string }
  | { status: "error"; message: string };

/**
 * Renders an appointment's generated brief (PRD §10.5). If `briefRef` is a signed
 * object-storage URL the markdown/text content is fetched and rendered inline;
 * a bare key renders as a "ready" card with a link out. Print + copy-link actions
 * are always available once a brief exists.
 */
export function BriefCard({
  briefRef,
  providerLabel,
}: {
  briefRef: string | undefined;
  providerLabel?: string;
}) {
  const state = briefStateFromRef(briefRef);
  const [fetchState, setFetchState] = useState<FetchState>({ status: "idle" });
  const [copied, setCopied] = useState(false);

  const url = state.kind === "ready" ? state.url : undefined;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!url) {
        setFetchState({ status: "idle" });
        return;
      }
      setFetchState({ status: "loading" });
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Brief fetch failed (${res.status}).`);
        const text = await res.text();
        if (!cancelled) setFetchState({ status: "loaded", text });
      } catch (e) {
        if (cancelled) return;
        setFetchState({
          status: "error",
          message: e instanceof Error ? e.message : "Could not load the brief.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  const handlePrint = useCallback(() => {
    if (typeof window !== "undefined") window.print();
  }, []);

  const handleCopy = useCallback(async () => {
    if (state.kind !== "ready") return;
    const link = state.url ?? state.ref;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [state]);

  if (state.kind === "none") return null;

  if (state.kind === "generating") {
    return (
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Brief</CardTitle>
            <CardDescription>{providerLabel ?? "Clinician brief"}</CardDescription>
          </div>
          <Badge variant="primary">
            <Loader2 className="size-3 animate-spin" aria-hidden /> Generating
          </Badge>
        </CardHeader>
        <div className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
          Composing your brief from current meds, adherence, and logged effects…
        </div>
      </Card>
    );
  }

  // state.kind === "ready"
  return (
    <Card>
      <CardHeader className="print:hidden">
        <div>
          <CardTitle>Clinician brief</CardTitle>
          <CardDescription>{providerLabel ?? "Patient-generated decision-support"}</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleCopy} aria-label="Copy share link">
            {copied ? <Check className="size-4 text-success" /> : <LinkIcon className="size-4" />}
            {copied ? "Copied" : "Copy link"}
          </Button>
          <Button variant="secondary" size="sm" onClick={handlePrint} aria-label="Print brief">
            <Printer className="size-4" /> Print
          </Button>
        </div>
      </CardHeader>

      <div className="mb-3 hidden print:block">
        <h2 className="text-base font-semibold">Clinician brief</h2>
        <p className="text-xs text-muted">{providerLabel}</p>
      </div>

      {fetchState.status === "loading" ? (
        <LoadingState label="Loading brief…" />
      ) : fetchState.status === "error" ? (
        <ErrorState title="Couldn’t load the brief" description={fetchState.message} />
      ) : fetchState.status === "loaded" ? (
        <article className="whitespace-pre-wrap text-sm leading-relaxed text-text">
          {fetchState.text}
        </article>
      ) : (
        // Ready, but the ref is a bare object-storage key (not directly fetchable
        // here) — surface it as ready with an explicit link out.
        <div className="flex items-start gap-2 text-sm text-text">
          <FileText className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <div>
            <p>Your brief is ready.</p>
            <p className="mt-1 break-all text-xs text-muted">
              Reference: <span className="mono">{state.ref}</span>
            </p>
            {state.url ? (
              <a
                href={state.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
              >
                <ExternalLink className="size-3" /> Open brief
              </a>
            ) : null}
          </div>
        </div>
      )}

      <p className="mt-4 text-[11px] leading-snug text-muted">
        This brief is patient-generated decision-support, composed only from your logged
        data.
      </p>
      <Disclaimer className="mt-2" />
    </Card>
  );
}
