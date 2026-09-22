import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTwilioClient, getTwilioConfig, isValidTwilioRequest } from "@/lib/twilio";

// Fires a few seconds AFTER the call already connected (async AMD — see
// /api/calls/route.ts for why). If it turns out to be a machine, the live
// AI may already be a few seconds into talking to a voicemail greeting;
// forcibly hanging up here bounds that to a few seconds instead of the
// ~2 minutes it got stuck for when AMD was off entirely.
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
  if (!callId) return NextResponse.json({ ok: true });

  const answeredBy = params.AnsweredBy ?? "";
  const isMachine = answeredBy.startsWith("machine");
  if (!isMachine) return NextResponse.json({ ok: true });

  await prisma.call
    .update({
      where: { id: callId },
      data: { outcome: "LEFT_VOICEMAIL", wasAnswered: false },
    })
    .catch(() => {
      // Call row may not exist if this webhook was hit out of band.
    });

  const config = getTwilioConfig();
  const callSid = params.CallSid;
  if (config && callSid) {
    try {
      await getTwilioClient(config).calls(callSid).update({ status: "completed" });
    } catch (err) {
      // Call may have already ended naturally by the time detection
      // finished — not an error worth failing this webhook over.
      console.error("[amd-status] failed to hang up on machine detection", err);
    }
  }

  return NextResponse.json({ ok: true });
}
