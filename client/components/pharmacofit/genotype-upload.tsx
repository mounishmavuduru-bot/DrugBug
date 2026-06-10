"use client";

import { useRef, useState } from "react";
import { Upload, FileUp, Loader2, AlertTriangle, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

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
 * Genotype file selection + upload (PRD §10.4 step 1). Accepts a 23andMe /
 * AncestryDNA raw genotype export (.txt or .zip), then hands it to
 * uploadGenotype(); the service converts to VCF, runs PharmCAT, and writes
 * derived phenotypes back to the profile. The parent shows the processing
 * state once `uploading` flips.
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
      setError("Unsupported file. Upload your raw genotype export as a .txt or .zip file.");
      setFile(null);
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("That file is too large to be a raw genotype export. Check the file and try again.");
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
      <Card className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-text">
            Upload your raw genotype file
          </h2>
          <p className="mt-1 text-xs leading-snug text-muted">
            Export the raw data from 23andMe or AncestryDNA and upload the file
            here. We convert it to VCF and run PharmCAT to derive your CPIC
            phenotypes. We never upload data you don’t choose.
          </p>
        </div>

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
            "flex w-full flex-col items-center justify-center gap-2 rounded-[var(--radius)] border border-dashed px-4 py-8 text-center transition-fast outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50",
            dragging
              ? "border-primary/60 bg-primary/5"
              : "border-border bg-elevated/40 hover:border-primary/40 hover:bg-elevated",
          ].join(" ")}
        >
          <div className="grid size-10 place-items-center rounded-full bg-elevated text-muted">
            <FileUp className="size-5" />
          </div>
          <p className="text-sm font-medium text-text">
            {file ? "Choose a different file" : "Tap to choose a file"}
          </p>
          <p className="text-[11px] text-muted">
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
          <div className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-border bg-elevated px-3 py-2">
            <div className="min-w-0">
              <p className="mono truncate text-xs text-text">{file.name}</p>
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
                className="rounded-md p-1 text-muted transition-fast hover:bg-surface hover:text-text"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p className="flex items-start gap-1.5 text-xs text-danger">
            <AlertTriangle className="mt-px size-3.5 shrink-0" /> {error}
          </p>
        ) : null}
      </Card>

      <Button
        variant="primary"
        className="w-full"
        onClick={handleUpload}
        disabled={!file || uploading}
      >
        {uploading ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Uploading…
          </>
        ) : (
          <>
            <Upload className="size-4" /> Upload and analyze
          </>
        )}
      </Button>
    </div>
  );
}
