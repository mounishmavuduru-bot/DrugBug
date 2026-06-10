"use client";

import { useEffect, useState } from "react";
import {
  BrowserMultiFormatReader,
} from "@zxing/library";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { Loader2, ScanBarcode, ScanLine } from "lucide-react";
import { Card } from "@/components/ui/card";
import { parseGs1, type Gs1Fields } from "./scan-utils";

type DecodeStatus = "idle" | "decoding" | "found" | "notfound" | "error";

export interface DecodedBarcode {
  text: string;
  format: string;
  gs1: Gs1Fields;
}

/**
 * On-device decode of the captured image (PRD §10.1 layer 1). Prefers GS1
 * DataMatrix but falls back to all formats, then parses GS1 AIs locally. The
 * result is *also* submitted to the server for AI-structure validation — this
 * is a head-start, never the final word.
 */
export function BarcodeDecoder({
  imageUrl,
  onDecoded,
}: {
  imageUrl: string;
  onDecoded?: (d: DecodedBarcode | null) => void;
}) {
  const [status, setStatus] = useState<DecodeStatus>("idle");
  const [decoded, setDecoded] = useState<DecodedBarcode | null>(null);

  useEffect(() => {
    let cancelled = false;

    // DataMatrix-first hints, but allow other formats so a bare 1D code still reads.
    const hints = new Map<DecodeHintType, unknown>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.DATA_MATRIX,
      BarcodeFormat.QR_CODE,
      BarcodeFormat.CODE_128,
      BarcodeFormat.EAN_13,
      BarcodeFormat.UPC_A,
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    const reader = new BrowserMultiFormatReader(hints as Map<DecodeHintType, unknown>);

    (async () => {
      setStatus("decoding");
      setDecoded(null);
      try {
        const result = await reader.decodeFromImageUrl(imageUrl);
        if (cancelled) return;
        const text = result.getText();
        const fmt = BarcodeFormat[result.getBarcodeFormat()] ?? "UNKNOWN";
        const out: DecodedBarcode = { text, format: fmt, gs1: parseGs1(text) };
        setDecoded(out);
        setStatus("found");
        onDecoded?.(out);
      } catch {
        if (cancelled) return;
        // NotFoundException is the common, non-error outcome here.
        setStatus("notfound");
        onDecoded?.(null);
      } finally {
        reader.reset();
      }
    })();

    return () => {
      cancelled = true;
      reader.reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl]);

  if (status === "decoding") {
    return (
      <Card className="flex items-center gap-2 px-4 py-3 text-xs text-muted">
        <Loader2 className="size-4 animate-spin text-brand" aria-hidden />
        Reading the barcode on this device…
      </Card>
    );
  }

  if (status === "notfound") {
    return (
      <Card className="flex items-start gap-2 px-4 py-3 text-xs leading-relaxed text-muted">
        <ScanLine className="mt-0.5 size-4 shrink-0 text-faint" strokeWidth={1.75} aria-hidden />
        <span>
          No barcode read on this device. The server will still try to read and validate the
          label.
        </span>
      </Card>
    );
  }

  if (status === "found" && decoded) {
    const { gs1 } = decoded;
    const hasFields = gs1.gtin || gs1.ndc || gs1.lot || gs1.expiry || gs1.serial;
    return (
      <Card className="space-y-2.5 px-4 py-3.5">
        <div className="flex items-center gap-2 border-b border-rule pb-2">
          <ScanBarcode className="size-4 text-brand" strokeWidth={1.75} aria-hidden />
          <span className="label-mono text-[11px] uppercase tracking-[0.14em] text-faint">
            Read on this device
          </span>
          <span className="label-mono ml-auto rounded-[var(--radius-sm)] bg-surface px-1.5 py-0.5 text-[10px] text-muted">
            {decoded.format}
          </span>
        </div>
        {hasFields ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <Field label="GTIN" value={gs1.gtin} />
            <Field label="NDC" value={gs1.ndc} />
            <Field label="Lot" value={gs1.lot} />
            <Field label="Expiry" value={gs1.expiry} />
            {gs1.serial ? <Field label="Serial" value={gs1.serial} full /> : null}
          </dl>
        ) : (
          <p className="label-mono break-all text-[11px] text-muted">{decoded.text}</p>
        )}
        <p className="text-[11px] leading-relaxed text-faint">
          Sent to the server to check the GS1 structure.
        </p>
      </Card>
    );
  }

  return null;
}

function Field({ label, value, full }: { label: string; value?: string; full?: boolean }) {
  if (!value) return null;
  return (
    <div className={full ? "col-span-2" : undefined}>
      <dt className="text-[10px] uppercase tracking-[0.1em] text-faint">{label}</dt>
      <dd className="label-mono break-all text-ink">{value}</dd>
    </div>
  );
}
