import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildTwilioWebhookUrl, getTwilioClient, getTwilioConfig } from "@/lib/twilio";

export async function POST(req: NextRequest) {
  const config = getTwilioConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Twilio is not configured (missing account SID, API key, secret, or phone number)." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => null);
  const customerRecordId = body?.customerRecordId as string | undefined;
  if (!customerRecordId) {
    return NextResponse.json({ error: "customerRecordId is required" }, { status: 400 });
  }

  const record = await prisma.customerRecord.findUnique({ where: { id: customerRecordId } });
  if (!record) {
    return NextResponse.json({ error: "Customer record not found" }, { status: 404 });
  }
  if (!record.isValid || !record.phoneNumberE164) {
    return NextResponse.json({ error: "Customer record is not valid for calling" }, { status: 400 });
  }

  const call = await prisma.call.create({
    data: { customerRecordId: record.id },
  });

  const voiceUrl = buildTwilioWebhookUrl("/api/twilio/voice", { callId: call.id });
  const statusCallbackUrl = buildTwilioWebhookUrl("/api/twilio/status", { callId: call.id });
  const recordingStatusCallbackUrl = buildTwilioWebhookUrl("/api/twilio/recording", { callId: call.id });
  const amdStatusCallbackUrl = buildTwilioWebhookUrl("/api/twilio/amd-status", { callId: call.id });

  try {
    const twilioCall = await getTwilioClient(config).calls.create({
      to: record.phoneNumberE164,
      from: config.phoneNumber,
      url: voiceUrl,
      statusCallback: statusCallbackUrl,
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      statusCallbackMethod: "POST",
      // Well within Twilio's 10,000 free storage-minutes/month at our
      // current test volume — revisit if call volume ever gets real.
      record: true,
      recordingStatusCallback: recordingStatusCallbackUrl,
      recordingStatusCallbackEvent: ["completed"],
      // Synchronous AMD (both "Enable" and "DetectMessageEnd") was tried and
      // rejected twice — even after moving the server to sin1, "Enable"
      // still added a ~5s delay before a human ever heard anything, which
      // is worse than the voicemail problem it was meant to fix (voicemail
      // is the rare case; every single call paying a 5s tax is not).
      // Async AMD is the actual fix: the call connects immediately (no
      // delay for the common case — a human answering), and detection runs
      // in the background, reported separately to amd-status/route.ts,
      // which forcibly hangs up if it turns out to be a machine — bounded
      // to a few seconds of the AI possibly talking into a voicemail
      // greeting, instead of the ~2 minutes it got stuck for with AMD fully
      // off. "DetectMessageEnd" (more accurate, previously avoided for
      // being slower) is fine now since it's async and no longer blocks
      // anything.
      machineDetection: "DetectMessageEnd",
      asyncAmd: "true",
      asyncAmdStatusCallback: amdStatusCallbackUrl,
    });

    const updated = await prisma.call.update({
      where: { id: call.id },
      data: { twilioCallSid: twilioCall.sid },
    });

    return NextResponse.json({ call: updated }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown Twilio error";
    await prisma.call.update({
      where: { id: call.id },
      data: { errorMessage: message, outcome: "CALL_FAILED" },
    });
    return NextResponse.json({ error: `Failed to place call: ${message}` }, { status: 502 });
  }
}
