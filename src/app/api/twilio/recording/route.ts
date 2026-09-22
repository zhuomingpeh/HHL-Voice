import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidTwilioRequest } from "@/lib/twilio";

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

  const recordingUrl = params.RecordingUrl;
  const durationSec = params.RecordingDuration ? Number(params.RecordingDuration) : undefined;

  await prisma.call
    .update({
      where: { id: callId },
      data: {
        ...(recordingUrl ? { recordingUrl } : {}),
        ...(durationSec !== undefined ? { recordingDurationSec: durationSec } : {}),
      },
    })
    .catch(() => {
      // Call row may not exist if this webhook was hit out of band.
    });

  return NextResponse.json({ ok: true });
}
