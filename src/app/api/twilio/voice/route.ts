import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidTwilioRequest } from "@/lib/twilio";

// Bare-bones placeholder TwiML — proves the call pipeline works end to end
// (Twilio dials out, connects, plays a message, hangs up) before the OpenAI
// conversation layer (development priority #5) replaces this. Deliberately
// generic and spec-compliant: no account-specific info is disclosed here,
// matching the "Basic reminder" example in requirements section 8.
const PLACEHOLDER_MESSAGE =
  "Hi, I'm calling with a reminder regarding a payment due today. This is an automated test call from the HHL Credit calling system. Goodbye.";

// No native Singapore-English voice exists on Twilio (checked Twilio Basic,
// Amazon Polly, and Google TTS). British English's Generative-tier voice is
// the closest, most natural-sounding available option — swap this if a
// better fit turns up (e.g. Polly.Kajal-Generative for Indian English).
const VOICE = "Polly.Amy-Generative";

function twimlResponse(say: string) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="${VOICE}">${say}</Say><Hangup/></Response>`;
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
  if (callId) {
    await prisma.call.update({
      where: { id: callId },
      data: {
        startTime: new Date(),
        wasAnswered: true,
      },
    }).catch(() => {
      // Call row may not exist if this webhook was hit out of band — don't
      // fail the call itself over a bookkeeping miss.
    });
  }

  return twimlResponse(PLACEHOLDER_MESSAGE);
}
