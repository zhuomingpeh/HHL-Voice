import { prisma } from "@/lib/prisma";
import type { AgentSettings } from "@prisma/client";

const SETTINGS_ID = "singleton";

// OpenAI Realtime's built-in voices as of gpt-realtime-2.1-mini. marin and
// cedar are the two purpose-built-for-Realtime voices (recommended); the
// rest are the older shared TTS voice set, also usable here.
export const OPENAI_VOICES = [
  "marin",
  "cedar",
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
];

// Creates the row on first read so there's no separate migration/seed step.
export async function getAgentSettings(): Promise<AgentSettings> {
  const existing = await prisma.agentSettings.findUnique({ where: { id: SETTINGS_ID } });
  if (existing) return existing;

  return prisma.agentSettings.create({ data: { id: SETTINGS_ID } });
}

export interface AgentSettingsUpdateInput {
  openaiVoice: string;
  openingLine: string;
  voicemailMessage: string;
  additionalContext: string;
}

export async function updateAgentSettings(input: AgentSettingsUpdateInput): Promise<AgentSettings> {
  return prisma.agentSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...input },
    update: input,
  });
}
