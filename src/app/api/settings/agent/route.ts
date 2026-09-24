import { NextRequest, NextResponse } from "next/server";
import { getAgentSettings, updateAgentSettings, OPENAI_VOICES } from "@/lib/agentSettings";

export async function GET() {
  const settings = await getAgentSettings();
  return NextResponse.json({ settings, voices: OPENAI_VOICES });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const openaiVoice = typeof body.openaiVoice === "string" ? body.openaiVoice.trim() : "";
  const openingLine = typeof body.openingLine === "string" ? body.openingLine.trim() : "";
  const voicemailMessage =
    typeof body.voicemailMessage === "string" ? body.voicemailMessage.trim() : "";

  if (!OPENAI_VOICES.includes(openaiVoice)) {
    return NextResponse.json({ error: "openaiVoice must be one of the supported voices" }, { status: 400 });
  }
  if (!openingLine) return NextResponse.json({ error: "openingLine is required" }, { status: 400 });
  if (!voicemailMessage)
    return NextResponse.json({ error: "voicemailMessage is required" }, { status: 400 });

  const settings = await updateAgentSettings({
    openaiVoice,
    openingLine,
    voicemailMessage,
    additionalContext: typeof body.additionalContext === "string" ? body.additionalContext.trim() : "",
  });

  return NextResponse.json({ settings });
}
