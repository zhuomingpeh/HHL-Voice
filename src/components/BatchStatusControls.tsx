"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const NEXT_ACTIONS: Record<string, { label: string; nextStatus: string }[]> = {
  DRAFT: [{ label: "Start batch", nextStatus: "RUNNING" }],
  VALIDATED: [{ label: "Start batch", nextStatus: "RUNNING" }],
  RUNNING: [
    { label: "Pause batch", nextStatus: "PAUSED" },
    { label: "Mark completed", nextStatus: "COMPLETED" },
  ],
  PAUSED: [
    { label: "Resume batch", nextStatus: "RUNNING" },
    { label: "Mark completed", nextStatus: "COMPLETED" },
  ],
  COMPLETED: [],
};

export function BatchStatusControls({
  batchId,
  status,
}: {
  batchId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actions = NEXT_ACTIONS[status] ?? [];

  async function transition(nextStatus: string) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/batches/${batchId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to update batch status");
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (actions.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      {actions.map((action) => (
        <button
          key={action.nextStatus}
          onClick={() => transition(action.nextStatus)}
          disabled={pending}
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
        >
          {action.label}
        </button>
      ))}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
