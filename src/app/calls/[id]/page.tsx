import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { callOutcomeLabel } from "@/lib/callOutcomes";

interface TranscriptEntry {
  role: string;
  text: string;
  timestamp: string;
}

export default async function CallDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const call = await prisma.call.findUnique({
    where: { id },
    include: { customerRecord: true, callbackTasks: true },
  });
  if (!call) notFound();

  const transcript = ((call.transcript as unknown as TranscriptEntry[] | null) ?? []).slice();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <a href={`/batches/${call.customerRecord.batchId}`} className="text-sm text-neutral-500 underline">
          ← Back to batch
        </a>
        <h1 className="mt-1 text-lg font-semibold">Call with {call.customerRecord.name}</h1>
        <p className="text-sm text-neutral-500">
          {call.customerRecord.phoneNumberE164 ?? call.customerRecord.phoneNumberRaw} ·{" "}
          {(call.startTime ?? call.createdAt).toLocaleString()}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <Stat label="Outcome" value={callOutcomeLabel(call.outcome)} />
        <Stat label="Duration" value={call.durationSeconds != null ? `${call.durationSeconds}s` : "—"} />
        <Stat label="Answered" value={call.wasAnswered == null ? "—" : call.wasAnswered ? "Yes" : "No"} />
        <Stat
          label="Callback"
          value={call.callbackRequired ? call.callbackReason ?? "Required" : "No"}
        />
      </div>

      {call.callSummary && (
        <div className="rounded-lg border border-neutral-200 bg-white p-4 text-sm">
          <h2 className="mb-1 font-medium">Summary</h2>
          <p className="text-neutral-700">{call.callSummary}</p>
        </div>
      )}

      {call.errorMessage && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Error: {call.errorMessage}
        </p>
      )}

      {call.recordingUrl && (
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-medium">Recording</h2>
          <audio controls src={`/api/calls/${call.id}/recording`} className="w-full" />
        </div>
      )}

      <div className="rounded-lg border border-neutral-200 bg-white">
        <h2 className="border-b border-neutral-200 px-4 py-3 font-medium">Transcript</h2>
        {transcript.length === 0 ? (
          <p className="px-4 py-6 text-sm text-neutral-500">
            No transcript captured for this call (e.g. it went to voicemail or wasn&apos;t answered).
          </p>
        ) : (
          <ol className="divide-y divide-neutral-100">
            {transcript.map((entry, i) => (
              <li key={i} className="flex gap-3 px-4 py-2 text-sm">
                <span className="w-20 shrink-0 text-xs text-neutral-400">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
                <span
                  className={`w-16 shrink-0 font-medium ${
                    entry.role === "assistant" ? "text-neutral-900" : "text-blue-700"
                  }`}
                >
                  {entry.role === "assistant" ? "AI" : "Customer"}
                </span>
                <span className="whitespace-pre-wrap text-neutral-700">{entry.text}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {call.callbackTasks.length > 0 && (
        <div className="rounded-lg border border-neutral-200 bg-white">
          <h2 className="border-b border-neutral-200 px-4 py-3 font-medium">Callback tasks from this call</h2>
          <ul className="divide-y divide-neutral-100 text-sm">
            {call.callbackTasks.map((task) => (
              <li key={task.id} className="px-4 py-2">
                <span className="font-medium">{task.reason}</span> — {task.status}
                {task.summary && <p className="text-neutral-600">{task.summary}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-neutral-200 bg-white p-3">
      <p className="text-neutral-500">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
