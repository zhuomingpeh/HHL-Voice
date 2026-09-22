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
      // Re-enabled after a live test hit voicemail with AMD off: with no
      // way to tell a machine from a human, the live conversational AI just
      // tried (and failed) to "talk" to the voicemail greeting and got
      // stuck for ~2 minutes instead of leaving voice/route.ts's dedicated
      // one-way message. Was disabled earlier for latency, but that same
      // commit also moved the server to sin1 (Singapore) — the two changes
      // were never isolated, so it's unclear how much of that delay was
      // actually AMD vs. cross-Pacific latency the region fix addresses.
      // "Enable" (not "DetectMessageEnd") for the faster of the two modes.
      machineDetection: "Enable",
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
