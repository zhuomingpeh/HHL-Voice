import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildTwilioMediaStreamUrl, isValidTwilioRequest } from "@/lib/twilio";

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;");
}

// Scripted, deterministic — not left to the AI to say. Twilio's own TTS
// plays this immediately on answer, which also buys time in the background
// for the OpenAI Realtime connection to finish setting up before it
// actually needs to listen for a reply.
// SSML <say-as interpret-as="characters"> spells out "HHL" clearly without
// the unnaturally long pauses that manually comma-separating letters
// ("H, H, L") caused — that made the whole opening line sound sluggish.
const OPENING_SCRIPT_SSML =
  '<speak>Hi, this is <say-as interpret-as="characters">HHL</say-as> Credit calling with a payment reminder. Will payment be made today?</speak>';

function connectStreamTwiml(streamUrl: string, callId: string) {
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?><Response>` +
    `<Say voice="Polly.Amy-Generative">${OPENING_SCRIPT_SSML}</Say>` +
    `<Connect><Stream url="${escapeXml(streamUrl)}">` +
    `<Parameter name="callId" value="${escapeXml(callId)}" /></Stream></Connect></Response>`;
  return new NextResponse(xml, { headers: { "Content-Type": "text/xml" } });
}

// Fully generic — no account specifics, since there's no one to verify
// identity with. Left as a one-way message, not a live AI conversation:
// trying to have the realtime AI improvise against an answering machine's
// own prompts/beep is exactly what caused the mid-sentence cutoff bug.
const VOICEMAIL_MESSAGE_SSML =
  '<speak>Hi, this is an automated call from <say-as interpret-as="characters">HHL</say-as> Credit regarding a payment reminder. Please call us back at your convenience. Thank you.</speak>';

function voicemailTwiml() {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Amy-Generative">${VOICEMAIL_MESSAGE_SSML}</Say><Hangup/></Response>`;
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

  if (isMachine) {
    return voicemailTwiml();
  }

  const streamUrl = buildTwilioMediaStreamUrl("/api/twilio/media-stream");
  return connectStreamTwiml(streamUrl, callId);
}
