"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, ImageUp, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/shared/states";

type CamState = "idle" | "starting" | "live" | "denied" | "error";

/**
 * Live rear-camera preview (facingMode "environment") with a capture button,
 * plus a file-upload fallback. Produces a JPEG Blob via the parent's onCapture.
 * Handles camera-permission-denied + unsupported-device states (PRD §10.1/§18).
 */
export function CameraCapture({
  onCapture,
  disabled,
}: {
  onCapture: (blob: Blob, previewUrl: string) => void;
  disabled?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState<CamState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const start = useCallback(async () => {
    setErrorMsg(null);
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setState("error");
      setErrorMsg("This device or browser doesn't expose a camera. Upload a photo instead.");
      return;
    }
    setState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setState("live");
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setState("denied");
      } else {
        setState("error");
        setErrorMsg(
          name === "NotFoundError"
            ? "No camera found on this device. Upload a photo instead."
            : "Couldn't start the camera. Upload a photo instead."
        );
      }
    }
  }, []);

  // Always release the camera when this component unmounts.
  useEffect(() => stop, [stop]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        stop();
        setState("idle");
        onCapture(blob, url);
      },
      "image/jpeg",
      0.92
    );
  }, [onCapture, stop]);

  const onFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ""; // allow re-selecting the same file
      if (!file) return;
      const url = URL.createObjectURL(file);
      onCapture(file, url);
    },
    [onCapture]
  );

  return (
    <div className="space-y-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-[var(--radius-md)] border border-rule bg-surface">
        {/* Video preview (only meaningful while live). */}
        <video
          ref={videoRef}
          playsInline
          muted
          className={state === "live" ? "size-full object-cover" : "hidden"}
          aria-label="Camera preview"
        />

        {state === "live" ? (
          <button
            type="button"
            onClick={stop}
            aria-label="Stop camera"
            className="absolute right-2 top-2 rounded-[var(--radius-pill)] bg-ink/80 p-1.5 text-card transition-colors duration-150 ease-[var(--ease)] hover:bg-ink"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}

        {state === "denied" ? (
          <div className="flex size-full flex-col items-center justify-center gap-2 p-6 text-center">
            <CameraOff className="size-7 text-danger" strokeWidth={1.75} aria-hidden />
            <p className="text-sm font-medium text-ink">Camera access is blocked</p>
            <p className="max-w-xs text-xs leading-relaxed text-muted">
              Allow camera access in your browser&apos;s site settings, then try again — or upload a
              photo below.
            </p>
            <Button variant="secondary" size="sm" onClick={start} className="mt-1">
              <RefreshCw className="size-4" aria-hidden /> Try again
            </Button>
          </div>
        ) : null}

        {(state === "idle" || state === "starting") ? (
          <div className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="grid size-12 place-items-center rounded-[var(--radius-md)] border border-rule bg-card text-brand">
              <Camera className="size-6" strokeWidth={1.75} aria-hidden />
            </div>
            <p className="max-w-xs text-xs leading-relaxed text-muted">
              {state === "starting"
                ? "Starting the camera…"
                : "Point the rear camera at the bottle, pill, or barcode."}
            </p>
            <Button
              variant="primary"
              size="sm"
              onClick={start}
              disabled={disabled || state === "starting"}
            >
              <Camera className="size-4" aria-hidden /> Start camera
            </Button>
          </div>
        ) : null}

        {state === "error" ? (
          <ErrorState
            title="Camera unavailable"
            description={errorMsg ?? undefined}
            retry={start}
            className="size-full justify-center"
          />
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          className="flex-1"
          onClick={capture}
          disabled={disabled || state !== "live"}
        >
          <Camera className="size-4" aria-hidden /> Capture
        </Button>
        <Button
          variant="secondary"
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          aria-label="Upload a photo"
        >
          <ImageUp className="size-4" aria-hidden /> Upload
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onFile}
        />
      </div>
    </div>
  );
}

/** Small captured-image preview with a retake action. */
export function CapturePreview({
  url,
  onRetake,
  disabled,
}: {
  url: string;
  onRetake: () => void;
  disabled?: boolean;
}) {
  return (
    <Card className="space-y-3 p-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-[var(--radius-md)] border border-rule bg-surface">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="The photo you captured for this scan" className="size-full object-cover" />
      </div>
      <Button variant="quiet" size="sm" onClick={onRetake} disabled={disabled} className="w-full">
        <RefreshCw className="size-4" aria-hidden /> Retake
      </Button>
    </Card>
  );
}
