"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Loader2, ScanLine } from "lucide-react";
import { useReducer } from "spacetimedb/react";

import { reducers, identityHex } from "@/lib/db";
import { useMyIdentity, useScans, useConnected } from "@/lib/hooks";
import { submitScan } from "@/lib/inference-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingState, ErrorState } from "@/components/shared/states";
import { Disclaimer } from "@/components/med/disclaimer";
import { CameraCapture, CapturePreview } from "@/components/scan/camera-capture";
import { ScanTypeSelector } from "@/components/scan/scan-type-selector";
import { BarcodeDecoder, type DecodedBarcode } from "@/components/scan/barcode-decoder";
import { ScanResult } from "@/components/scan/scan-result";
import {
  stashPrefill,
  type Scan,
  type ScanType,
} from "@/components/scan/scan-utils";

type Phase = "capture" | "submitting" | "processing" | "complete" | "error";

const TERMINAL_OK = "complete";

/**
 * `useSearchParams()` triggers client-side rendering up to the nearest Suspense
 * boundary during prerender; a static page must wrap it or the production build
 * bails out (Next 16). The boundary keeps the page statically prerenderable.
 */
export default function ScanPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading scan…" />}>
      <ScanFlow />
    </Suspense>
  );
}

function ScanFlow() {
  const router = useRouter();
  const search = useSearchParams();
  const intentAdd = search.get("intent") === "add";

  const me = useMyIdentity();
  const connected = useConnected();
  const { scans, ready: scansReady } = useScans();

  const enqueueScan = useReducer(reducers.enqueueScan);

  const [scanType, setScanType] = useState<ScanType>("bottle");
  const [phase, setPhase] = useState<Phase>("capture");
  const [error, setError] = useState<string | null>(null);

  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [, setDecoded] = useState<DecodedBarcode | null>(null);

  // The scanId we created + submitted; we watch useScans() for its completion.
  const [activeScanId, setActiveScanId] = useState<bigint | null>(null);
  // Snapshot of scanIds present *before* we enqueue, to detect the new row.
  const knownIdsRef = useRef<Set<string>>(new Set());

  // Revoke object URLs we created so we don't leak blobs.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleCapture = useCallback(
    (b: Blob, url: string) => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setBlob(b);
      setPreviewUrl(url);
      setDecoded(null);
      setError(null);
    },
    [previewUrl]
  );

  const retake = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setBlob(null);
    setPreviewUrl(null);
    setDecoded(null);
    setError(null);
  }, [previewUrl]);

  /**
   * Submit flow (PRD §10.1):
   *   1. enqueueScan({ imageRef:"(pending)", scanType }) → creates the queued row
   *   2. find the new scan's scanId from useScans() (newest not previously seen)
   *   3. submitScan({ scanId, identityHex, scanType, image }) → service writes back
   *   4. result arrives via useScans() realtime (status "complete")
   */
  const submit = useCallback(async () => {
    if (!me || !blob) return;
    setError(null);
    setPhase("submitting");
    // Snapshot current scan ids so we can identify the freshly-created row.
    knownIdsRef.current = new Set(scans.map((s) => s.scanId.toString()));
    try {
      await enqueueScan({ imageRef: "(pending)", scanType });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t queue the scan. Try again.");
      setPhase("error");
    }
    // The new row arrives via subscription; an effect below picks it up and
    // calls submitScan once we can read its server-assigned scanId.
  }, [me, blob, scanType, enqueueScan, scans]);

  // Step 2+3: once the queued row appears, grab its id and submit the image.
  const submittedRef = useRef(false);
  useEffect(() => {
    if (phase !== "submitting" || !me || !blob) return;
    // Newest scan not present before enqueue == the row we just created.
    const fresh = scans.find((s) => !knownIdsRef.current.has(s.scanId.toString()));
    if (!fresh || submittedRef.current) return;
    submittedRef.current = true;
    setActiveScanId(fresh.scanId);
    setPhase("processing");
    (async () => {
      try {
        await submitScan({
          scanId: fresh.scanId,
          identityHex: identityHex(me),
          scanType,
          image: blob,
        });
        // Result lands via the realtime subscription (status "complete").
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "The scan service is unreachable. Your scan is queued; try again shortly."
        );
        setPhase("error");
      }
    })();
  }, [phase, scans, me, blob, scanType]);

  // The scan row we're tracking, found live in the subscription.
  const activeScan: Scan | undefined = useMemo(() => {
    if (activeScanId === null) return undefined;
    const idStr = activeScanId.toString();
    return scans.find((s) => s.scanId.toString() === idStr);
  }, [scans, activeScanId]);

  // Step 4: derive completion from the realtime row rather than storing it in an
  // effect — the result is server-owned external state we simply reflect.
  const scanStatus = activeScan?.status?.toLowerCase();
  const scanComplete =
    scanStatus === TERMINAL_OK ||
    (!!activeScan?.identifiedDrug && scanStatus !== "queued" && scanStatus !== "processing");
  const scanFailed = scanStatus === "failed" || scanStatus === "error";

  // Effective phase: "processing" promotes to complete/error when the row lands.
  const effectivePhase: Phase =
    phase === "processing" && activeScan
      ? scanComplete
        ? "complete"
        : scanFailed
          ? "error"
          : "processing"
      : phase;

  const failureMessage =
    phase === "error"
      ? error
      : scanFailed
        ? "The scan couldn’t be processed. Re-scan in better lighting or enter it manually."
        : error;

  const startOver = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    submittedRef.current = false;
    setBlob(null);
    setPreviewUrl(null);
    setDecoded(null);
    setActiveScanId(null);
    setError(null);
    setPhase("capture");
  }, [previewUrl]);

  const handleAdd = useCallback(
    (chosen: { name: string; ndc: string }) => {
      stashPrefill({
        name: chosen.name,
        genericName: "",
        rxnormCode: "",
        ndc: chosen.ndc ?? "",
      });
      // Carry the name in the query too, in case sessionStorage is unavailable.
      const qs = new URLSearchParams({ prefill: "1", name: chosen.name });
      router.push(`/meds/add?${qs.toString()}`);
    },
    [router]
  );

  // ---- connection / identity gating ----
  if (!connected || !me) {
    return <LoadingState label="Connecting to DrugBug…" />;
  }

  return (
    <div className="space-y-5 pb-4">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <ScanLine className="size-5 text-primary" /> Scan
        </h1>
        <p className="text-xs text-muted">
          Identify a medication and check its authenticity.
          {intentAdd ? " On a confident match, you can add it to your list." : ""}
        </p>
      </header>

      {/* ---------- Capture phase ---------- */}
      {(effectivePhase === "capture" || effectivePhase === "submitting") && (
        <div className="space-y-4">
          <section className="space-y-2">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
              Scan type
            </h2>
            <ScanTypeSelector
              value={scanType}
              onChange={setScanType}
              disabled={phase === "submitting"}
            />
          </section>

          <section className="space-y-2">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
              {blob ? "Captured image" : "Capture"}
            </h2>
            {blob && previewUrl ? (
              <CapturePreview url={previewUrl} onRetake={retake} disabled={phase === "submitting"} />
            ) : (
              <CameraCapture onCapture={handleCapture} disabled={phase === "submitting"} />
            )}
          </section>

          {/* On-device barcode decode (PRD §10.1 layer 1). */}
          {blob && previewUrl && scanType === "barcode" ? (
            <BarcodeDecoder imageUrl={previewUrl} onDecoded={setDecoded} />
          ) : null}

          {error ? (
            <Card className="border-danger/40">
              <p className="flex items-center gap-2 text-sm text-danger">
                <AlertTriangle className="size-4" /> {error}
              </p>
            </Card>
          ) : null}

          {blob ? (
            <div className="space-y-3">
              <Button
                variant="primary"
                className="w-full"
                onClick={submit}
                disabled={phase === "submitting" || !scansReady}
              >
                {phase === "submitting" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Queuing scan…
                  </>
                ) : (
                  "Analyze scan"
                )}
              </Button>
              <Disclaimer />
            </div>
          ) : (
            <Disclaimer />
          )}
        </div>
      )}

      {/* ---------- Processing phase ---------- */}
      {effectivePhase === "processing" && (
        <div className="space-y-4">
          {previewUrl ? (
            <CapturePreview url={previewUrl} onRetake={() => {}} disabled />
          ) : null}
          <Card className="flex flex-col items-center gap-3 py-10 text-center">
            <Loader2 className="size-6 animate-spin text-primary" />
            <div>
              <p className="text-sm font-medium text-text">Analyzing your scan…</p>
              <p className="mt-1 text-xs text-muted">
                Running identification + authenticity layers. This usually takes a few seconds.
              </p>
            </div>
          </Card>
          <Disclaimer />
        </div>
      )}

      {/* ---------- Complete phase ---------- */}
      {effectivePhase === "complete" && activeScan && (
        <div className="space-y-4">
          <ScanResult scan={activeScan} intentAdd={intentAdd} onAdd={handleAdd} />
          <Button variant="outline" className="w-full" onClick={startOver}>
            <ScanLine className="size-4" /> Scan another
          </Button>
        </div>
      )}

      {/* ---------- Error phase ---------- */}
      {effectivePhase === "error" && (
        <div className="space-y-4">
          <ErrorState
            title="Scan failed"
            description={failureMessage ?? undefined}
            retry={startOver}
          />
        </div>
      )}
    </div>
  );
}
