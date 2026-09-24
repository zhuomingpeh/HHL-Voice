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

  const clamp = (n: unknown, min: number, max: number, fallback: number) =>
    typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;

  const settings = await updateAgentSettings({
    voiceId,
    voiceName: typeof body.voiceName === "string" ? body.voiceName : null,
    voiceStability: clamp(body.voiceStability, 0, 1, 0.5),
    voiceSimilarityBoost: clamp(body.voiceSimilarityBoost, 0, 1, 0.75),
    voiceStyle: clamp(body.voiceStyle, 0, 1, 0),
    voiceSpeakerBoost: Boolean(body.voiceSpeakerBoost),
    voiceSpeed: clamp(body.voiceSpeed, 0.7, 1.2, 1.0),
    openingLine,
    voicemailMessage,
    additionalContext: typeof body.additionalContext === "string" ? body.additionalContext.trim() : "",
  });

  return NextResponse.json({ settings });
}
