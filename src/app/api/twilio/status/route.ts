import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidTwilioRequest } from "@/lib/twilio";

// Twilio CallStatus values: queued, ringing, in-progress, completed, busy,
// failed, no-answer, canceled. https://www.twilio.com/docs/voice/api/call-resource
function outcomeForStatus(status: string): string | null {
  switch (status) {
    case "completed":
      return "ANSWERED"; // placeholder until the AI conversation layer sets a real outcome
    case "busy":
    case "no-answer":
      return "NO_ANSWER";
    case "failed":
    case "canceled":
      return "CALL_FAILED";
    default:
      return null; // queued/ringing/in-progress — not resolved yet
  }
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
  if (!callId) return NextResponse.json({ ok: true });

  const callStatus = params.CallStatus ?? "";
  const durationSeconds = params.CallDuration ? Number(params.CallDuration) : undefined;
  let outcome = outcomeForStatus(callStatus);
  const isTerminal = ["completed", "busy", "failed", "no-answer", "canceled"].includes(callStatus);

  const errorMessage =
    params.ErrorCode || params.ErrorMessage
      ? `${params.ErrorCode ?? ""} ${params.ErrorMessage ?? ""}`.trim()
      : undefined;

  // "completed" is the generic fallback ("ANSWERED") — don't let it clobber
  // a more specific outcome the AI (or async AMD) already set, e.g.
  // LEFT_VOICEMAIL from /api/twilio/amd-status forcibly hanging up before
  // this status callback lands.
  if (callStatus === "completed") {
    const existing = await prisma.call.findUnique({ where: { id: callId }, select: { outcome: true } });
    if (existing?.outcome) outcome = null;
  }

  await prisma.call.update({
    where: { id: callId },
    data: {
      ...(isTerminal ? { endTime: new Date() } : {}),
      ...(durationSeconds !== undefined ? { durationSeconds } : {}),
      ...(outcome ? { outcome, wasAnswered: outcome === "ANSWERED" } : {}),
      ...(errorMessage ? { errorMessage } : {}),
    },
  }).catch(() => {
    // Call row may not exist if this webhook was hit out of band.
  });

  return NextResponse.json({ ok: true });
}
