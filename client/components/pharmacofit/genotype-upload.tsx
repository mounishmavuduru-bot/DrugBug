"use client";

import { useRef, useState } from "react";
import { Upload, FileUp, Loader2, AlertTriangle, X } from "lucide-react";

import { Button } from "@/components/ui/button";

const ACCEPT = ".txt,.zip,text/plain,application/zip";
const MAX_BYTES = 100 * 1024 * 1024; // 100 MB — raw 23andMe/Ancestry exports are well under this.

function isAcceptedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".txt") || name.endsWith(".zip");
}

function prettyBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Genotype file selection + upload (step 1). Accepts a 23andMe / AncestryDNA raw
 * genotype export (.txt or .zip), then hands it to uploadGenotype(); the service
 * converts to VCF, runs PharmCAT, and writes derived phenotypes back to the
 * profile. The parent shows the processing state once `uploading` flips.
 */
export function GenotypeUpload({
  onUpload,
  uploading,
}: {
  onUpload: (file: File) => Promise<void>;
  uploading: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function pickFile(f: File | undefined) {
    if (!f) return;
    if (!isAcceptedFile(f)) {
      setError("That file type isn't supported. Upload your raw genotype export as a .txt or .zip file.");
      setFile(null);
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("That file is larger than a raw genotype export should be. Check the file and try again.");
      setFile(null);
      return;
    }
    setError(null);
    setFile(f);
  }

  async function handleUpload() {
    if (!file) return;
    setError(null);
    try {
      await onUpload(file);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Upload failed. Check your connection and try again.",
      );
    }
  }

  return (
    <div className="space-y-3">
      <section className="rounded-[var(--radius-md)] border border-rule bg-card">
        <div className="border-b border-rule px-4 py-3.5">
          <h2 className="font-display text-lg text-ink">
            Upload your raw genotype file
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Export the raw data from 23andMe or AncestryDNA and upload the file
            here. We convert it to a VCF and run PharmCAT to call your CPIC
            phenotypes. Nothing is uploaded until you choose a file and submit.
          </p>
        </div>

        <div className="px-4 py-4 space-y-3">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pickFile(e.dataTransfer.files?.[0]);
            }}
            disabled={uploading}
            aria-label="Choose a genotype file to upload"
            className={[
              "flex w-full flex-col items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-dashed px-4 py-8 text-center transition-colors duration-150 ease-[var(--ease)] disabled:opacity-50",
              dragging
                ? "border-brand bg-brand-tint"
                : "border-rule-strong bg-surface hover:border-brand hover:bg-brand-tint",
            ].join(" ")}
          >
            <FileUp className="size-6 text-faint" strokeWidth={1.75} aria-hidden />
            <p className="text-sm font-medium text-ink">
              {file ? "Choose a different file" : "Choose a file or drop it here"}
            </p>
            <p className="label-mono text-[11px] text-muted">
              23andMe / AncestryDNA raw data · .txt or .zip
            </p>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              disabled={uploading}
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
          </button>

          {file ? (
            <div className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-rule bg-surface px-3 py-2">
              <div className="min-w-0">
                <p className="label-mono truncate text-xs text-ink">{file.name}</p>
                <p className="text-[11px] text-muted">{prettyBytes(file.size)}</p>
              </div>
              {!uploading ? (
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setError(null);
                    if (inputRef.current) inputRef.current.value = "";
                  }}
                  aria-label="Remove selected file"
                  className="rounded-[var(--radius-sm)] p-1 text-muted transition-colors duration-150 ease-[var(--ease)] hover:bg-brand-tint hover:text-ink"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <p className="flex items-start gap-1.5 text-sm text-danger" role="alert">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </p>
          ) : null}
        </div>
      </section>

      <Button
        variant="primary"
        className="w-full"
        onClick={handleUpload}
        disabled={!file || uploading}
      >
        {uploading ? (
          <>
            <Loader2 className="animate-spin" /> Uploading
          </>
        ) : (
          <>
            <Upload /> Upload and analyze
          </>
        )}
      </Button>
    </div>
  );
}
