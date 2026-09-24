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

  const clamp01 = (n: unknown, fallback: number) =>
    typeof n === "number" && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;

  try {
    const audio = await previewTextToSpeech(
      voiceId,
      typeof body?.text === "string" && body.text.trim() ? body.text.trim() : PREVIEW_TEXT,
      {
        stability: clamp01(body?.voiceStability, 0.5),
        similarityBoost: clamp01(body?.voiceSimilarityBoost, 0.75),
        style: clamp01(body?.voiceStyle, 0),
        speakerBoost: Boolean(body?.voiceSpeakerBoost),
      }
    );
    return new NextResponse(audio, { headers: { "Content-Type": "audio/mpeg" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown ElevenLabs error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
