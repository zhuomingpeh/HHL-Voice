import { prisma } from "@/lib/prisma";
import type { AgentSettings } from "@prisma/client";

const SETTINGS_ID = "singleton";

// Creates the row on first read so there's no separate migration/seed step —
// voiceId falls back to the env var (the cloned voice already wired into
// production) so nothing changes for existing calls until someone edits it.
export async function getAgentSettings(): Promise<AgentSettings> {
  const existing = await prisma.agentSettings.findUnique({ where: { id: SETTINGS_ID } });
  if (existing) return existing;

  return prisma.agentSettings.create({
    data: {
      id: SETTINGS_ID,
      voiceId: process.env.ELEVENLABS_VOICE_ID ?? "",
    },
  });
}

export interface AgentSettingsUpdateInput {
  voiceId: string;
  voiceName: string | null;
  voiceStability: number;
  voiceSimilarityBoost: number;
  voiceStyle: number;
  voiceSpeakerBoost: boolean;
  openingLine: string;
  voicemailMessage: string;
}

export async function updateAgentSettings(input: AgentSettingsUpdateInput): Promise<AgentSettings> {
  return prisma.agentSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...input },
    update: input,
  });
}
