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

  try {
    const twilioCall = await getTwilioClient(config).calls.create({
      to: record.phoneNumberE164,
      from: config.phoneNumber,
      url: voiceUrl,
      statusCallback: statusCallbackUrl,
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      statusCallbackMethod: "POST",
      // Detect voicemail deterministically (waits for the greeting to end)
      // rather than letting the AI guess mid-conversation — Twilio passes
      // the result as `AnsweredBy` on the voice webhook request itself.
      machineDetection: "DetectMessageEnd",
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
