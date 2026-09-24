import { NextRequest, NextResponse } from "next/server";
import { getAgentSettings, updateAgentSettings } from "@/lib/agentSettings";
import { listVoices } from "@/lib/elevenlabs";

export async function GET() {
  const [settings, voices] = await Promise.all([
    getAgentSettings(),
    listVoices().catch(() => []), // don't block the page if ElevenLabs is down
  ]);
  return NextResponse.json({ settings, voices });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const voiceId = typeof body.voiceId === "string" ? body.voiceId.trim() : "";
  const openingLine = typeof body.openingLine === "string" ? body.openingLine.trim() : "";
  const voicemailMessage =
    typeof body.voicemailMessage === "string" ? body.voicemailMessage.trim() : "";

  if (!voiceId) return NextResponse.json({ error: "voiceId is required" }, { status: 400 });
  if (!openingLine) return NextResponse.json({ error: "openingLine is required" }, { status: 400 });
  if (!voicemailMessage)
    return NextResponse.json({ error: "voicemailMessage is required" }, { status: 400 });

  const clamp01 = (n: unknown, fallback: number) =>
    typeof n === "number" && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;

  const settings = await updateAgentSettings({
    voiceId,
    voiceName: typeof body.voiceName === "string" ? body.voiceName : null,
    voiceStability: clamp01(body.voiceStability, 0.5),
    voiceSimilarityBoost: clamp01(body.voiceSimilarityBoost, 0.75),
    voiceStyle: clamp01(body.voiceStyle, 0),
    voiceSpeakerBoost: Boolean(body.voiceSpeakerBoost),
    openingLine,
    voicemailMessage,
  });

  return NextResponse.json({ settings });
}
