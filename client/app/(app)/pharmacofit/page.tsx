"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dna, Loader2, ShieldOff, AlertTriangle, RefreshCw } from "lucide-react";
import { useReducer } from "spacetimedb/react";

import { reducers, identityHex } from "@/lib/db";
import { useMyIdentity, useMyProfile, useConnected } from "@/lib/hooks";
import { getPgxFlags, uploadGenotype, type PgxFlag } from "@/lib/inference-client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { LoadingState, EmptyState, ErrorState } from "@/components/shared/states";
import { Disclaimer } from "@/components/med/disclaimer";
import { ConsentGate } from "@/components/pharmacofit/consent-gate";
import { GenotypeUpload } from "@/components/pharmacofit/genotype-upload";
import { PgxFlagEntry } from "@/components/pharmacofit/pgx-flag-card";
import { LimitationCaveat } from "@/components/pharmacofit/limitation-caveat";
import { ConsentBanner } from "@/components/pharmacofit/consent-banner";

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
            : "We couldn't load your pharmacogenomic flags.",
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
        e instanceof Error ? e.message : "We couldn't revoke consent. Try again.",
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
      <header className="border-b border-rule-strong pb-5">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div>
            <p className="label-mono text-[11px] uppercase tracking-[0.14em] text-muted">
              Pharmacogenomics · CPIC
            </p>
            <h1 className="mt-1">PharmacoFit</h1>
          </div>
          {consented ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setRevokeOpen(true)}
              aria-label="Revoke pharmacogenomic consent"
              className="shrink-0"
            >
              <ShieldOff /> Revoke consent
            </Button>
          ) : null}
        </div>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
          Checks your active medications against CPIC pharmacogenomic guidance,
          using metabolizer phenotypes called from a genotype file you upload.
        </p>
      </header>
    ),
    [consented],
  );

  // ---- connection / profile gating ----
  if (!connected || !me || !profileReady) {
    return (
      <div className="space-y-6">
        <header className="border-b border-rule-strong pb-5">
          <p className="label-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            Pharmacogenomics · CPIC
          </p>
          <h1 className="mt-1">PharmacoFit</h1>
        </header>
        <LoadingState rows={3} label="Connecting to DrugBug" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={Dna}
          title="Set up your profile first"
          description="PharmacoFit reads your active medications to match them against pharmacogenomic guidance. Create your profile, then come back here."
        />
        <Disclaimer />
      </div>
    );
  }

  // ---- consent gate ----
  if (!consented) {
    return (
      <div className="space-y-6">
        {header}
        <ConsentGate onConsent={handleConsent} />
        <Disclaimer />
      </div>
    );
  }

  // ---- consented: upload + processing + results ----
  const showProcessing = awaitingProcessing && !phenotypesReady;

  return (
    <div className="space-y-6">
      {header}

      <ConsentBanner />

      {/* Upload (always available so the user can re-upload an updated export). */}
      {!phenotypesReady && !showProcessing ? (
        <GenotypeUpload onUpload={handleUpload} uploading={uploading} />
      ) : null}

      {uploadError && !showProcessing ? (
        <ErrorState title="Upload failed" description={uploadError} />
      ) : null}

      {/* Processing: genotype uploaded, waiting for phenotypes to land. */}
      {showProcessing ? (
        <section
          className="rounded-[var(--radius-md)] border border-rule bg-card px-5 py-8"
          aria-busy="true"
          aria-live="polite"
        >
          <div className="flex items-center gap-3">
            <Loader2 className="size-5 shrink-0 animate-spin text-brand" aria-hidden />
            <div>
              <p className="font-medium text-ink">Reading your genotype file</p>
              <p className="mt-1 max-w-md text-sm leading-relaxed text-muted">
                Converting it to a VCF and running PharmCAT to call your CPIC
                phenotypes. Your flags appear here automatically when it finishes —
                you can leave this page and come back.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {/* Results. */}
      {phenotypesReady ? (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-3 border-b border-rule pb-2">
            <div className="flex items-baseline gap-2.5">
              <h2 className="font-display text-lg text-ink">
                Flags for your medications
              </h2>
              {flagsState.status === "ready" && flagsState.flags.length > 0 ? (
                <span
                  className="grid min-w-5 place-items-center rounded-[var(--radius-pill)] bg-brand px-1.5 label-mono tnum text-xs text-brand-ink"
                  aria-label={`${flagsState.flags.length} flags`}
                >
                  {flagsState.flags.length}
                </span>
              ) : null}
            </div>
            {flagsState.status === "ready" || flagsState.status === "error" ? (
              <Button
                variant="quiet"
                size="sm"
                onClick={loadFlags}
                aria-label="Refresh pharmacogenomic flags"
              >
                <RefreshCw /> Refresh
              </Button>
            ) : null}
          </div>

          {flagsState.status === "loading" || flagsState.status === "idle" ? (
            <LoadingState rows={2} label="Loading your flags" />
          ) : null}

          {flagsState.status === "error" ? (
            <ErrorState
              title="We couldn't load your flags"
              description={flagsState.message}
              retry={loadFlags}
            />
          ) : null}

          {flagsState.status === "ready" ? (
            flagsState.flags.length === 0 ? (
              <EmptyState
                icon={Dna}
                title="No actionable flags"
                description="None of your active medications have CPIC guidance for the phenotypes we called. Add medications and refresh to check again."
              />
            ) : (
              <div className="divide-y divide-rule overflow-hidden rounded-[var(--radius-md)] border border-rule bg-card">
                {flagsState.flags.map((flag, i) => (
                  <PgxFlagEntry
                    key={`${flag.gene}-${flag.medication}-${i}`}
                    flag={flag}
                  />
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
          <p className="text-sm leading-relaxed text-muted">
            Revoking clears the pharmacogenomic phenotypes we derived for you, so
            PharmacoFit stops matching your medications against your DNA. You can
            consent and upload your genotype again later.
          </p>
          {revokeError ? (
            <p className="flex items-start gap-1.5 text-sm text-danger" role="alert">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {revokeError}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button
              variant="secondary"
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
                  <Loader2 className="animate-spin" /> Revoking
                </>
              ) : (
                <>
                  <ShieldOff /> Revoke and clear
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
