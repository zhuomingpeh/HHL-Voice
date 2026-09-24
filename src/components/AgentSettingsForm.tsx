"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface VoiceSummary {
  voiceId: string;
  name: string;
  category: string;
}

interface AgentSettingsValues {
  voiceId: string;
  voiceName: string | null;
  voiceStability: number;
  voiceSimilarityBoost: number;
  voiceStyle: number;
  voiceSpeakerBoost: boolean;
  openingLine: string;
  voicemailMessage: string;
}

// Recommended starting point for a calm, consistent, professional-sounding
// collections reminder call — this is what the current cloned voice was
// tuned against and approved on.
const PROFESSIONAL_DEFAULTS = {
  voiceStability: 0.5,
  voiceSimilarityBoost: 0.75,
  voiceStyle: 0,
  voiceSpeakerBoost: true,
};

export function AgentSettingsForm({
  initialSettings,
  voices,
}: {
  initialSettings: AgentSettingsValues;
  voices: VoiceSummary[];
}) {
  const router = useRouter();
  const [values, setValues] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function update<K extends keyof AgentSettingsValues>(key: K, value: AgentSettingsValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setSaved(false);
  }

  async function handlePreview() {
    setError(null);
    setPreviewing(true);
    try {
      const res = await fetch("/api/settings/agent/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voiceId: values.voiceId,
          voiceStability: values.voiceStability,
          voiceSimilarityBoost: values.voiceSimilarityBoost,
          voiceStyle: values.voiceStyle,
          voiceSpeakerBoost: values.voiceSpeakerBoost,
          text: values.openingLine,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Preview failed");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (audioRef.current) {
        audioRef.current.src = url;
        await audioRef.current.play();
      }
    } catch {
      setError("Preview failed — check your connection and try again.");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    setSaved(false);
    try {
      const selectedVoice = voices.find((v) => v.voiceId === values.voiceId);
      const res = await fetch("/api/settings/agent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, voiceName: selectedVoice?.name ?? values.voiceName }),
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

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-neutral-600">Voice</span>
          <select
            value={values.voiceId}
            onChange={(e) => update("voiceId", e.target.value)}
            className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
          >
            {!voices.some((v) => v.voiceId === values.voiceId) && values.voiceId && (
              <option value={values.voiceId}>
                {values.voiceName ?? "Current voice"} (not in ElevenLabs list)
              </option>
            )}
            {voices.map((v) => (
              <option key={v.voiceId} value={v.voiceId}>
                {v.name} {v.category === "cloned" ? "— cloned" : `— ${v.category}`}
              </option>
            ))}
          </select>
          {voices.length === 0 && (
            <span className="mt-1 block text-xs text-amber-600">
              Couldn&apos;t load voices from ElevenLabs — check ELEVENLABS_API_KEY. You can still
              save the voice ID already configured.
            </span>
          )}
        </label>

        <div className="grid grid-cols-2 gap-4">
          <SliderField
            label="Stability"
            hint="Higher = calmer and more consistent; lower = more expressive but variable."
            value={values.voiceStability}
            onChange={(v) => update("voiceStability", v)}
          />
          <SliderField
            label="Similarity boost"
            hint="Higher = closer match to the cloned sample."
            value={values.voiceSimilarityBoost}
            onChange={(v) => update("voiceSimilarityBoost", v)}
          />
          <SliderField
            label="Style exaggeration"
            hint="Keep low for a neutral, professional tone."
            value={values.voiceStyle}
            onChange={(v) => update("voiceStyle", v)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={values.voiceSpeakerBoost}
              onChange={(e) => update("voiceSpeakerBoost", e.target.checked)}
            />
            <span className="text-neutral-600">Speaker boost (clarity on phone audio)</span>
          </label>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={handlePreview}
            disabled={previewing || !values.voiceId}
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            {previewing ? "Generating…" : "Preview voice"}
          </button>
          <button
            type="button"
            onClick={() => setValues((v) => ({ ...v, ...PROFESSIONAL_DEFAULTS }))}
            className="text-sm text-neutral-500 underline hover:text-neutral-900"
          >
            Reset tuning to recommended defaults
          </button>
          <audio ref={audioRef} className="hidden" />
        </div>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 font-medium">Context</h2>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-neutral-600">
            Opening line (played immediately when the call connects)
          </span>
          <textarea
            value={values.openingLine}
            onChange={(e) => update("openingLine", e.target.value)}
            rows={2}
            className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </label>

        <label className="block text-sm">
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

function SliderField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 flex items-center justify-between text-neutral-600">
        {label}
        <span className="text-neutral-400">{value.toFixed(2)}</span>
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
      <span className="mt-0.5 block text-xs text-neutral-400">{hint}</span>
    </label>
  );
}
