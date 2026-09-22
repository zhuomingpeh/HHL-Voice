import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildTwilioMediaStreamUrl, isValidTwilioRequest } from "@/lib/twilio";

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;");
}

function connectStreamTwiml(streamUrl: string) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="${escapeXml(streamUrl)}" /></Connect></Response>`;
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

  await prisma.call
    .update({
      where: { id: callId },
      data: { startTime: new Date(), wasAnswered: true },
    })
    .catch(() => {
      // Call row may not exist if this webhook was hit out of band — don't
      // fail the call itself over a bookkeeping miss.
    });

  const streamUrl = buildTwilioMediaStreamUrl("/api/twilio/media-stream", { callId });
  return connectStreamTwiml(streamUrl);
}
