"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dna,
  Loader2,
  ShieldOff,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { useReducer } from "spacetimedb/react";

import { reducers, identityHex } from "@/lib/db";
import { useMyIdentity, useMyProfile, useConnected } from "@/lib/hooks";
import { getPgxFlags, uploadGenotype, type PgxFlag } from "@/lib/inference-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { LoadingState, EmptyState, ErrorState } from "@/components/shared/states";
import { Disclaimer } from "@/components/med/disclaimer";
import { ConsentGate } from "@/components/pharmacofit/consent-gate";
import { GenotypeUpload } from "@/components/pharmacofit/genotype-upload";
import { PgxFlagCard } from "@/components/pharmacofit/pgx-flag-card";
import { LimitationCaveat } from "@/components/pharmacofit/limitation-caveat";

/**
 * Whether the profile has derived PGx phenotypes written back by the service.
 * pgxPhenotypes is a JSON string; empty / "{}" / "[]" / "null" means none yet.
 */
function hasPhenotypes(pgxPhenotypes?: string): boolean {
  const s = (pgxPhenotypes || "").trim();
  if (!s || s === "{}" || s === "[]" || s === "null") return false;
  return true;
}

type FlagsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; flags: PgxFlag[]; caveat: string }
  | { status: "error"; message: string };

export default function PharmacoFitPage() {
  const connected = useConnected();
  const me = useMyIdentity();
  const { profile, ready: profileReady } = useMyProfile();

  const setPgxConsent = useReducer(reducers.setPgxConsent);

  // ---- local UI state ----
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // True once we've successfully POSTed a genotype this session and are waiting
  // for the service to write phenotypes back via the realtime subscription.
  const [awaitingProcessing, setAwaitingProcessing] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const [flagsState, setFlagsState] = useState<FlagsState>({ status: "idle" });

  const consented = !!profile?.pgxConsent;
  const phenotypesReady = hasPhenotypes(profile?.pgxPhenotypes);

  // Once phenotypes land, we're no longer "awaiting".
  useEffect(() => {
    if (phenotypesReady && awaitingProcessing) setAwaitingProcessing(false);
  }, [phenotypesReady, awaitingProcessing]);

  // ---- fetch flags whenever phenotypes are ready ----
  const loadFlags = useCallback(async () => {
    if (!me) return;
    setFlagsState({ status: "loading" });
    try {
      const { flags, caveat } = await getPgxFlags(identityHex(me));
      setFlagsState({ status: "ready", flags, caveat });
    } catch (e) {
      setFlagsState({
        status: "error",
        message:
          e instanceof Error
            ? e.message
            : "Couldn’t load your pharmacogenomic flags.",
      });
    }
  }, [me]);

  // Auto-load flags once consented + phenotypes exist; refetch if processing
  // just completed. A ref guards against duplicate loads on re-renders.
  const loadedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!consented || !phenotypesReady || !me) {
      loadedForRef.current = null;
      return;
    }
    const key = `${identityHex(me)}:${profile?.pgxPhenotypes ?? ""}`;
    if (loadedForRef.current === key) return;
    loadedForRef.current = key;
    void loadFlags();
  }, [consented, phenotypesReady, me, profile?.pgxPhenotypes, loadFlags]);

  // ---- consent / revoke handlers ----
  const handleConsent = useCallback(async () => {
    await setPgxConsent({ consent: true });
  }, [setPgxConsent]);

  const handleRevoke = useCallback(async () => {
    setRevoking(true);
    setRevokeError(null);
    try {
      await setPgxConsent({ consent: false });
      setRevokeOpen(false);
      setFlagsState({ status: "idle" });
      setAwaitingProcessing(false);
      loadedForRef.current = null;
    } catch (e) {
      setRevokeError(
        e instanceof Error ? e.message : "Couldn’t revoke consent. Try again.",
      );
    } finally {
      setRevoking(false);
    }
  }, [setPgxConsent]);

  // ---- upload handler ----
  const handleUpload = useCallback(
    async (file: File) => {
      if (!me) return;
      setUploading(true);
      setUploadError(null);
      try {
        await uploadGenotype({ identityHex: identityHex(me), file });
        // Service processes async and writes phenotypes back; reflect that wait.
        setAwaitingProcessing(true);
      } catch (e) {
        setUploadError(
          e instanceof Error
            ? e.message
            : "Upload failed. Check your connection and try again.",
        );
        throw e; // let the upload component surface the inline error too
      } finally {
        setUploading(false);
      }
    },
    [me],
  );

  const header = useMemo(
    () => (
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Dna className="size-5 text-primary" /> PharmacoFit
          </h1>
          <p className="text-xs text-muted">
            Personalize medication risk to your DNA using a CPIC-based pipeline.
          </p>
        </div>
        {consented ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRevokeOpen(true)}
            aria-label="Revoke pharmacogenomic consent"
          >
            <ShieldOff className="size-4" /> Revoke
          </Button>
        ) : null}
      </header>
    ),
    [consented],
  );

  // ---- connection / profile gating ----
  if (!connected || !me || !profileReady) {
    return <LoadingState label="Connecting to DrugBug…" />;
  }

  if (!profile) {
    return (
      <div className="space-y-5 pb-4">
        {header}
        <EmptyState
          icon={Dna}
          title="Set up your profile first"
          description="Create your profile before using PharmacoFit so flags can be matched to your medications."
        />
      </div>
    );
  }

  // ---- consent gate ----
  if (!consented) {
    return (
      <div className="space-y-5 pb-4">
        {header}
        <ConsentGate onConsent={handleConsent} />
        <Disclaimer />
      </div>
    );
  }

  // ---- consented: upload + processing + results ----
  const showProcessing = awaitingProcessing && !phenotypesReady;

  return (
    <div className="space-y-5 pb-4">
      {header}

      <div className="flex items-center gap-2 rounded-[var(--radius)] border border-success/30 bg-success/10 px-3 py-2">
        <ShieldCheck className="size-4 shrink-0 text-success" />
        <p className="text-xs text-text">
          Consent on file — your genomic data is encrypted, never sold or shared,
          and you can revoke at any time.
        </p>
      </div>

      {/* Upload (always available so the user can re-upload an updated export). */}
      {!phenotypesReady && !showProcessing ? (
        <GenotypeUpload onUpload={handleUpload} uploading={uploading} />
      ) : null}

      {uploadError && !showProcessing ? (
        <Card className="border-danger/40">
          <p className="flex items-center gap-2 text-sm text-danger">
            <AlertTriangle className="size-4 shrink-0" /> {uploadError}
          </p>
        </Card>
      ) : null}

      {/* Processing: genotype uploaded, waiting for phenotypes to land. */}
      {showProcessing ? (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <Loader2 className="size-6 animate-spin text-primary" />
          <div>
            <p className="text-sm font-medium text-text">
              Analyzing your genotype…
            </p>
            <p className="mt-1 max-w-xs text-xs text-muted">
              Converting to VCF and running PharmCAT to call your CPIC
              phenotypes. Results appear here automatically when ready.
            </p>
          </div>
        </Card>
      ) : null}

      {/* Results. */}
      {phenotypesReady ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
              Your pharmacogenomic flags
            </h2>
            {flagsState.status === "ready" || flagsState.status === "error" ? (
              <button
                onClick={loadFlags}
                className="flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
                aria-label="Refresh flags"
              >
                <RefreshCw className="size-3" /> Refresh
              </button>
            ) : null}
          </div>

          {flagsState.status === "loading" || flagsState.status === "idle" ? (
            <LoadingState label="Loading your flags…" />
          ) : null}

          {flagsState.status === "error" ? (
            <ErrorState
              title="Couldn’t load flags"
              description={flagsState.message}
              retry={loadFlags}
            />
          ) : null}

          {flagsState.status === "ready" ? (
            flagsState.flags.length === 0 ? (
              <EmptyState
                icon={Dna}
                title="No actionable flags"
                description="None of your active medications have a CPIC pharmacogenomic flag for the phenotypes we called. Add medications to see relevant guidance."
              />
            ) : (
              <div className="space-y-3">
                {flagsState.flags.map((flag, i) => (
                  <PgxFlagCard key={`${flag.gene}-${flag.medication}-${i}`} flag={flag} />
                ))}
              </div>
            )
          ) : null}

          <LimitationCaveat
            caveat={flagsState.status === "ready" ? flagsState.caveat : undefined}
          />
        </section>
      ) : null}

      {/* The honest limitation is shown before results land too. */}
      {!phenotypesReady ? <LimitationCaveat /> : null}

      <Disclaimer />

      {/* Revoke confirmation. */}
      <Modal
        open={revokeOpen}
        onClose={() => (revoking ? null : setRevokeOpen(false))}
        title="Revoke pharmacogenomic consent?"
      >
        <div className="space-y-4">
          <p className="text-sm leading-snug text-muted">
            Revoking consent clears your derived pharmacogenomic phenotypes from
            your profile, and your PharmacoFit flags will no longer be available.
            Your medication risk will no longer be personalized to your DNA. You
            can re-consent and re-upload your genotype later.
          </p>
          {revokeError ? (
            <p className="flex items-center gap-2 text-sm text-danger">
              <AlertTriangle className="size-4 shrink-0" /> {revokeError}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setRevokeOpen(false)}
              disabled={revoking}
            >
              Keep consent
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={handleRevoke}
              disabled={revoking}
            >
              {revoking ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Revoking…
                </>
              ) : (
                <>
                  <ShieldOff className="size-4" /> Revoke and clear
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
