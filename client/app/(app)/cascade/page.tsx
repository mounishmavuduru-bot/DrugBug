"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  GitBranch,
  Network,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

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
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">CascadeMap</h1>
          <p className="text-xs text-muted">
            Interaction graph + multi-drug cascade detection.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={recompute}
          disabled={recomputing || !me || !connected || activeMeds.length === 0}
          className="shrink-0"
          aria-label="Recompute interactions"
        >
          <RefreshCw className={cn("size-4", recomputing && "animate-spin")} />
          {recomputing ? "Recomputing…" : "Recompute"}
        </Button>
      </header>

      {/* Cache provenance: when computed + which model/KB versions (PRD §18 auditability). */}
      {hasCache ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>Computed {relativeTo(computedAt)}</span>
          {cache?.modelVersion ? (
            <Badge variant="neutral">model {cache.modelVersion}</Badge>
          ) : null}
          {cache?.kbVersion ? <Badge variant="neutral">KB {cache.kbVersion}</Badge> : null}
        </div>
      ) : null}

      {recomputeError ? (
        <ErrorState
          title="Couldn't recompute"
          description={recomputeError}
          retry={recompute}
        />
      ) : null}

      {!ready ? (
        <LoadingState label="Loading interaction graph…" />
      ) : activeMeds.length === 0 ? (
        <EmptyState
          icon={Network}
          title="No active medications"
          description="Add medications to map their interactions and detect multi-drug cascades."
          action={
            <Link href="/meds/add" className={buttonVariants({ variant: "primary" })}>
              <Plus className="size-4" /> Add medication
            </Link>
          }
        />
      ) : !hasCache ? (
        <EmptyState
          icon={Network}
          title="No interaction analysis yet"
          description="Recompute to run the knowledge-base lookup, GNN, and cascade head over your current regimen."
          action={
            <Button onClick={recompute} disabled={recomputing || !connected}>
              <RefreshCw className={cn("size-4", recomputing && "animate-spin")} />
              {recomputing ? "Recomputing…" : "Recompute now"}
            </Button>
          }
        />
      ) : (
        <>
          {/* Summary counters */}
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="neutral">
              {activeMeds.length} med{activeMeds.length === 1 ? "" : "s"}
            </Badge>
            <Badge variant={pairs.length ? "warning" : "neutral"}>
              {pairs.length} pairwise
            </Badge>
            <Badge variant={cascades.length ? "danger" : "neutral"}>
              {cascades.length} cascade{cascades.length === 1 ? "" : "s"}
            </Badge>
          </div>

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
              <Card className="hidden flex-col items-center justify-center gap-2 text-center text-muted lg:flex">
                <ShieldCheck className="size-5 text-primary" aria-hidden />
                <p className="text-xs">
                  Tap an edge to see its mechanism, effect, management, and source.
                </p>
              </Card>
            )}
          </div>

          {pairs.length === 0 ? (
            <Card>
              <div className="flex items-center gap-2 text-sm text-text">
                <ShieldCheck className="size-4 text-success" aria-hidden />
                No pairwise interactions detected across your active medications.
              </div>
            </Card>
          ) : null}

          {/* Cascades section */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <GitBranch className="size-4 text-primary" aria-hidden />
              <h2 className="text-sm font-semibold">Multi-drug cascades</h2>
            </div>
            {cascades.length === 0 ? (
              <Card>
                <p className="text-sm text-muted">
                  No 3+ drug cascades detected. Cascades surface combinations that pairwise
                  checks can miss.
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
