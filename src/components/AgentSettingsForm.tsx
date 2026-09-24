"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface AgentSettingsValues {
  openaiVoice: string;
  openingLine: string;
  voicemailMessage: string;
  additionalContext: string;
}

export function AgentSettingsForm({
  initialSettings,
  voices,
}: {
  initialSettings: AgentSettingsValues;
  voices: string[];
}) {
  const router = useRouter();
  const [values, setValues] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function update<K extends keyof AgentSettingsValues>(key: K, value: AgentSettingsValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/settings/agent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Save failed");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Save failed — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 font-medium">Sound</h2>

        <label className="block text-sm">
          <span className="mb-1 block text-neutral-600">Voice</span>
          <select
            value={values.openaiVoice}
            onChange={(e) => update("openaiVoice", e.target.value)}
            className="w-full max-w-xs rounded border border-neutral-300 px-2 py-1.5 text-sm capitalize"
          >
            {voices.map((v) => (
              <option key={v} value={v} className="capitalize">
                {v}
                {v === "marin" || v === "cedar" ? " (recommended)" : ""}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-neutral-400">
            OpenAI&apos;s native Realtime voice — spoken directly by the model with no extra
            synthesis step, which is what keeps replies low-latency and interruptible.
          </span>
        </label>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 font-medium">Context</h2>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-neutral-600">
            Opening line (the AI&apos;s first spoken turn when the call connects — interruptible,
            like any other turn)
          </span>
          <textarea
            value={values.openingLine}
            onChange={(e) => update("openingLine", e.target.value)}
            rows={2}
            className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </label>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-neutral-600">
            Voicemail message (played if the call reaches an answering machine)
          </span>
          <textarea
            value={values.voicemailMessage}
            onChange={(e) => update("voicemailMessage", e.target.value)}
            rows={2}
            className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-neutral-600">
            Additional background for the AI (company policy, rules, tone notes — never read
            aloud, and never overrides the fixed compliance rules)
          </span>
          <textarea
            value={values.additionalContext}
            onChange={(e) => update("additionalContext", e.target.value)}
            rows={4}
            placeholder="e.g. HHL Credit is a licensed moneylender in Singapore. Be extra patient with elderly customers. Never mention legal action."
            className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded bg-neutral-900 px-4 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        {saved && <span className="text-sm text-green-600">Saved.</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}
