"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CompleteCallbackButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function markCompleted() {
    setPending(true);
    try {
      await fetch(`/api/callbacks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      onClick={markCompleted}
      disabled={pending}
      className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50 disabled:opacity-50"
    >
      Mark completed
    </button>
  );
}
