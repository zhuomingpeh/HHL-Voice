import { getAgentSettings, OPENAI_VOICES } from "@/lib/agentSettings";
import { AgentSettingsForm } from "@/components/AgentSettingsForm";

// Must always reflect the latest saved settings, not a build-time snapshot —
// without this, Next statically prerenders this page (no dynamic APIs used)
// and router.refresh() after Save would keep showing stale data until the
// next deploy.
export const dynamic = "force-dynamic";

export default async function AgentSettingsPage() {
  const settings = await getAgentSettings();

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
          openaiVoice: settings.openaiVoice,
          openingLine: settings.openingLine,
          voicemailMessage: settings.voicemailMessage,
          additionalContext: settings.additionalContext,
        }}
        voices={OPENAI_VOICES}
      />
    </div>
  );
}
