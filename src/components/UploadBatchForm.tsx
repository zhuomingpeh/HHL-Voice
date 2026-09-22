"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface UploadResult {
  batchId: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  emptyRowsSkipped: number;
}

export function UploadBatchForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setResult(null);

    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Choose a CSV file first.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setIsUploading(true);
    try {
      const res = await fetch("/api/batches", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Upload failed");
        return;
      }

      setResult(data);
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    } catch {
      setError("Upload failed — check your connection and try again.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="mb-2 font-medium">Upload today&apos;s calling batch</h2>
      <p className="mb-3 text-sm text-neutral-500">
        CSV must include columns: Name, Contact Number, Due Date, Remarks.
      </p>
      <form onSubmit={handleSubmit} className="flex items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="text-sm"
          disabled={isUploading}
        />
        <button
          type="submit"
          disabled={isUploading}
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {isUploading ? "Uploading…" : "Upload"}
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {result && (
        <div className="mt-3 rounded border border-green-200 bg-green-50 p-3 text-sm">
          <p>
            Batch created: {result.totalRows} rows ({result.validRows} valid,{" "}
            {result.invalidRows} invalid
            {result.emptyRowsSkipped > 0 ? `, ${result.emptyRowsSkipped} empty rows skipped` : ""}
            ).
          </p>
          <a
            href={`/batches/${result.batchId}`}
            className="mt-1 inline-block font-medium text-neutral-900 underline"
          >
            Review batch →
          </a>
        </div>
      )}
    </div>
  );
}
