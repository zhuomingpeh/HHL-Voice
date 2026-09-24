import { NextRequest, NextResponse } from "next/server";
import { previewTextToSpeech } from "@/lib/elevenlabs";

// Synthesizes a short sample with whatever voice + tuning is currently
// selected in the form (not necessarily saved yet), so staff can hear a
// change before committing to it.
const PREVIEW_TEXT =
  "Hi this is HHL Credit, your payment is due today. Will payment be made today?";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const voiceId = typeof body?.voiceId === "string" ? body.voiceId : "";
  if (!voiceId) return NextResponse.json({ error: "voiceId is required" }, { status: 400 });

  const clamp = (n: unknown, min: number, max: number, fallback: number) =>
    typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;

  try {
    const audio = await previewTextToSpeech(
      voiceId,
      typeof body?.text === "string" && body.text.trim() ? body.text.trim() : PREVIEW_TEXT,
      {
        stability: clamp(body?.voiceStability, 0, 1, 0.5),
        similarityBoost: clamp(body?.voiceSimilarityBoost, 0, 1, 0.75),
        style: clamp(body?.voiceStyle, 0, 1, 0),
        speakerBoost: Boolean(body?.voiceSpeakerBoost),
        speed: clamp(body?.voiceSpeed, 0.7, 1.2, 1.0),
      }
    );
    return new NextResponse(audio, { headers: { "Content-Type": "audio/mpeg" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown ElevenLabs error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
