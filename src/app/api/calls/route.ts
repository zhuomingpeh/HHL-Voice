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
      // machineDetection was tried (both "DetectMessageEnd" and "Enable")
      // and dropped for now — even "Enable" added noticeable delay before a
      // human ever heard anything, since Twilio won't call the voice
      // webhook until it finishes analyzing the first moment of audio.
      // Given how often calls are answered by a human, that tradeoff wasn't
      // worth it. voice/route.ts still handles AnsweredBy defensively if
      // this gets re-enabled later.
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
