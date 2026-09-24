import { getAgentSettings } from "@/lib/agentSettings";
import { listVoices } from "@/lib/elevenlabs";
import { AgentSettingsForm } from "@/components/AgentSettingsForm";

// Must always reflect the latest saved settings and current ElevenLabs voice
// list, not a build-time snapshot — without this, Next statically prerenders
// this page (no dynamic APIs used) and router.refresh() after Save would
// keep showing stale data until the next deploy.
export const dynamic = "force-dynamic";

export default async function AgentSettingsPage() {
  const [settings, voices] = await Promise.all([
    getAgentSettings(),
    listVoices().catch(() => []),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Agent settings</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Voice and script wording for the AI caller. The compliance rules (no
          negotiating instalments or settlements, never inventing a balance,
          escalating upset customers, etc.) are fixed in code and not
          editable here.
        </p>
      </div>

      <AgentSettingsForm
        initialSettings={{
          voiceId: settings.voiceId,
          voiceName: settings.voiceName,
          voiceStability: settings.voiceStability,
          voiceSimilarityBoost: settings.voiceSimilarityBoost,
          voiceStyle: settings.voiceStyle,
          voiceSpeakerBoost: settings.voiceSpeakerBoost,
          openingLine: settings.openingLine,
          voicemailMessage: settings.voicemailMessage,
        }}
        voices={voices}
      />
    </div>
  );
}
