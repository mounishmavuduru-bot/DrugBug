"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { GitBranch, Network, Plus, RefreshCw } from "lucide-react";

import { identityHex } from "@/lib/db";
import { useMyMeds, useInteractions, useMyIdentity, useConnected } from "@/lib/hooks";
import { recomputeInteractions } from "@/lib/inference-client";
import { tsToDate, relativeTo } from "@/lib/format";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingState, EmptyState, ErrorState } from "@/components/shared/states";
import { Disclaimer } from "@/components/med/disclaimer";

import { CascadeGraph } from "@/components/cascade/cascade-graph";
import { EdgePanel } from "@/components/cascade/edge-panel";
import { CascadeList } from "@/components/cascade/cascade-list";
import { CascadeModal } from "@/components/cascade/cascade-modal";
import {
  parsePairs,
  parseCascades,
  type CascadePair,
  type CascadeChain,
} from "@/components/cascade/cascade-utils";
import { cn } from "@/lib/utils";

export default function CascadePage() {
  const me = useMyIdentity();
  const connected = useConnected();
  const { meds, ready: medsReady } = useMyMeds();
  const { cache, ready: cacheReady } = useInteractions();

  const [selectedPair, setSelectedPair] = useState<CascadePair | null>(null);
  const [selectedCascade, setSelectedCascade] = useState<CascadeChain | null>(null);
  const [recomputing, setRecomputing] = useState(false);
  const [recomputeError, setRecomputeError] = useState<string | null>(null);

  const activeMeds = useMemo(() => meds.filter((m) => m.active), [meds]);

  // Cache JSON fields → typed findings.
  const pairs = useMemo(() => parsePairs(cache?.pairs), [cache]);
  const cascades = useMemo(() => parseCascades(cache?.cascades), [cache]);

  const computedAt = useMemo(() => tsToDate(cache?.computedAt ?? null), [cache]);

  const recompute = useCallback(async () => {
    if (!me) return;
    setRecomputeError(null);
    setRecomputing(true);
    try {
      // Fire-and-forget: results write back to interactions_cache and arrive via
      // the useInteractions() subscription (PRD §10.2 serving model).
      await recomputeInteractions(identityHex(me));
    } catch (e) {
      setRecomputeError(e instanceof Error ? e.message : "Recompute failed.");
    } finally {
      setRecomputing(false);
    }
  }, [me]);

  const ready = medsReady && cacheReady;
  const hasCache = Boolean(cache);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <span className="label-mono text-[11px] uppercase tracking-[0.14em] text-brand">
            Interaction map
          </span>
          <h1 className="mt-1 text-3xl">
            <span className="border-b-2 border-brand pb-0.5">Cascade</span>
          </h1>
          <p className="mt-1 max-w-md text-sm text-muted">
            How your medications interact, and which combinations of three or more
            raise risk that a pair-by-pair check would miss.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={recompute}
          disabled={recomputing || !me || !connected || activeMeds.length === 0}
          className="shrink-0"
          aria-label="Recheck interactions across your current medications"
        >
          <RefreshCw className={cn("size-4", recomputing && "animate-spin")} aria-hidden />
          {recomputing ? "Rechecking" : "Recheck"}
        </Button>
      </header>

      {/* Cache provenance: when computed + which model/KB versions (PRD §18 auditability). */}
      {hasCache ? (
        <div className="flex flex-wrap items-center gap-2 border-y border-rule py-2 text-xs text-muted">
          <span>Last checked {relativeTo(computedAt)}</span>
          {cache?.modelVersion ? (
            <Badge variant="outline">
              <span className="label-mono">model {cache.modelVersion}</span>
            </Badge>
          ) : null}
          {cache?.kbVersion ? (
            <Badge variant="outline">
              <span className="label-mono">reference {cache.kbVersion}</span>
            </Badge>
          ) : null}
        </div>
      ) : null}

      {recomputeError ? (
        <ErrorState
          title="Couldn't recheck interactions"
          description={recomputeError}
          retry={recompute}
        />
      ) : null}

      {!ready ? (
        <LoadingState rows={3} label="Loading your interaction map" />
      ) : activeMeds.length === 0 ? (
        <EmptyState
          icon={Network}
          title="No active medications to map"
          description="Add the medications you take and Cascade will show how they interact and flag risky three-drug combinations."
          action={
            <Link href="/meds/add" className={buttonVariants({ variant: "primary" })}>
              <Plus className="size-4" aria-hidden /> Add a medication
            </Link>
          }
        />
      ) : !hasCache ? (
        <EmptyState
          icon={Network}
          title="No interaction check has run yet"
          description="Recheck to look up your current medications against the reference database and run the model that predicts multi-drug cascades."
          action={
            <Button onClick={recompute} disabled={recomputing || !connected}>
              <RefreshCw className={cn("size-4", recomputing && "animate-spin")} aria-hidden />
              {recomputing ? "Rechecking" : "Recheck now"}
            </Button>
          }
        />
      ) : (
        <>
          {/* Tally — a clinical count line; the cascade figure carries the weight. */}
          <dl className="grid grid-cols-3 divide-x divide-rule overflow-hidden rounded-[var(--radius-md)] border border-rule bg-card">
            <Tally n={activeMeds.length} label="On your list" tone="text-brand" />
            <Tally
              n={pairs.length}
              label={`Interacting pair${pairs.length === 1 ? "" : "s"}`}
              tone={pairs.length ? "text-caution" : undefined}
            />
            <Tally
              n={cascades.length}
              label={`Cascade${cascades.length === 1 ? "" : "s"}`}
              tone={cascades.length ? "text-danger" : undefined}
            />
          </dl>

          {/* Graph + side panel: panel stacks below the graph on mobile, beside on lg. */}
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <CascadeGraph
              meds={activeMeds}
              pairs={pairs}
              cascades={cascades}
              onEdgeSelect={setSelectedPair}
            />
            {selectedPair ? (
              <EdgePanel pair={selectedPair} onClose={() => setSelectedPair(null)} />
            ) : (
              <Card className="hidden flex-col justify-center gap-2 p-4 lg:flex">
                <p className="label-mono text-[11px] uppercase tracking-[0.14em] text-faint">
                  Reading the map
                </p>
                <p className="text-sm leading-relaxed text-muted">
                  Each tablet is one of your medications. A line between two means
                  they interact; its color is the severity. Tap a line to see the
                  mechanism, effect, and what to do about it.
                </p>
              </Card>
            )}
          </div>

          {pairs.length === 0 ? (
            <Card className="px-4 py-3">
              <p className="text-sm text-ink">
                No interactions found between any pair of your active medications.
              </p>
            </Card>
          ) : null}

          {/* Cascades section */}
          <section className="space-y-3">
            <div className="flex items-center gap-2 border-b border-rule pb-2">
              <GitBranch className="size-4 text-brand" strokeWidth={1.75} aria-hidden />
              <h2 className="text-lg">Three-drug cascades</h2>
            </div>
            {cascades.length === 0 ? (
              <Card className="px-4 py-3">
                <p className="text-sm text-muted">
                  No three-drug cascades found. A cascade is when three or more
                  medications combine in a way that a single pair check would miss.
                </p>
              </Card>
            ) : (
              <CascadeList cascades={cascades} onSelect={setSelectedCascade} />
            )}
          </section>

          <Disclaimer />
        </>
      )}

      <CascadeModal
        cascade={selectedCascade}
        open={Boolean(selectedCascade)}
        onClose={() => setSelectedCascade(null)}
      />
    </div>
  );
}

/** One figure in the cascade tally — a big tabular number over a quiet label. */
function Tally({ n, label, tone }: { n: number; label: string; tone?: string }) {
  return (
    <div className="px-4 py-3">
      <dd className={cn("font-display tnum text-2xl leading-none", tone ?? "text-ink")}>{n}</dd>
      <dt className="mt-1.5 text-[11px] leading-tight text-muted">{label}</dt>
    </div>
  );
}
