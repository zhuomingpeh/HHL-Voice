import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildTwilioMediaStreamUrl, isValidTwilioRequest } from "@/lib/twilio";
import { getAgentSettings } from "@/lib/agentSettings";

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;");
}

// Tried having the AI speak the opening line itself as its first native-audio
// turn (real-time, so the customer could interrupt it) — reverted. Real test
// calls showed a consistent, unpredictable 5-10s delay: OpenAI's own
// server-side turn detection kept auto-cancelling that very first response
// the instant it heard anything from the customer's line, even normal
// pickup noise/"hello?", before the WebSocket + session.update + generation
// pipeline had even settled. Every turn AFTER the opening line was
// consistently fast and interruptible in testing — the problem was isolated
// to this specific first turn, racing against connection setup. A fixed
// Twilio <Say> has none of that: it plays instantly and takes exactly as
// long as the text requires, at the cost of not being interruptible
// mid-word — a better trade than an unpredictable multi-second hang.
function connectStreamTwiml(streamUrl: string, callId: string, openingLine: string) {
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?><Response>` +
    `<Say voice="Polly.Amy-Generative">${escapeXml(openingLine)}</Say>` +
    `<Connect><Stream url="${escapeXml(streamUrl)}">` +
    `<Parameter name="callId" value="${escapeXml(callId)}" /></Stream></Connect></Response>`;
  return new NextResponse(xml, { headers: { "Content-Type": "text/xml" } });
}

// Fully generic — no account specifics, since there's no one to verify
// identity with. Left as a one-way message, not a live AI conversation:
// trying to have the realtime AI improvise against an answering machine's
// own prompts/beep is exactly what caused the mid-sentence cutoff bug.
function voicemailTwiml(voicemailMessage: string) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Amy-Generative">${escapeXml(voicemailMessage)}</Say><Hangup/></Response>`;
  return new NextResponse(xml, { headers: { "Content-Type": "text/xml" } });
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of formData.entries()) params[key] = String(value);

  const signature = req.headers.get("X-Twilio-Signature");
  const valid = await isValidTwilioRequest(req.url, params, signature);
  if (!valid) {
    return new NextResponse("Invalid signature", { status: 403 });
  }

  const callId = req.nextUrl.searchParams.get("callId");
  if (!callId) {
    return new NextResponse("Missing callId", { status: 400 });
  }

  // Deterministic voicemail detection (spec: needs "a voice mail protocol")
  // — Twilio's Answering Machine Detection, requested with
  // machineDetection: "Enable" in /api/calls, delivers its result as
  // AnsweredBy on this very request rather than a separate callback.
  const answeredBy = params.AnsweredBy;
  const isMachine = typeof answeredBy === "string" && answeredBy.startsWith("machine");

  await prisma.call
    .update({
      where: { id: callId },
      data: isMachine
        ? { startTime: new Date(), wasAnswered: false, outcome: "LEFT_VOICEMAIL" }
        : { startTime: new Date(), wasAnswered: true },
    })
    .catch(() => {
      // Call row may not exist if this webhook was hit out of band — don't
      // fail the call itself over a bookkeeping miss.
    });

  const settings = await getAgentSettings();

  if (isMachine) {
    return voicemailTwiml(settings.voicemailMessage);
  }

  const streamUrl = buildTwilioMediaStreamUrl("/api/twilio/media-stream");
  return connectStreamTwiml(streamUrl, callId, settings.openingLine);
}
