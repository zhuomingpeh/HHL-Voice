"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CallButton({ customerRecordId }: { customerRecordId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function placeCall() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerRecordId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to place call");
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={placeCall}
          disabled={pending}
          className="rounded bg-red-600 px-2 py-1 text-xs text-white disabled:opacity-50"
        >
          {pending ? "Calling…" : "Confirm: dial now"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="rounded border border-neutral-300 px-2 py-1 text-xs"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={() => setConfirming(true)}
        className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
      >
        Place real call
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
