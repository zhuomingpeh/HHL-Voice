import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Twilio recording media requires the account's own Basic Auth — proxying
// it here (rather than linking straight to Twilio) keeps that credential
// server-side and reuses the dashboard's own session auth (this route sits
// behind proxy.ts like everything else outside /api/twilio and /api/auth).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const call = await prisma.call.findUnique({ where: { id }, select: { recordingUrl: true } });
  if (!call?.recordingUrl) {
    return new NextResponse("No recording for this call", { status: 404 });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    return new NextResponse("Twilio is not configured", { status: 500 });
  }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const res = await fetch(`${call.recordingUrl}.mp3`, {
    headers: { Authorization: `Basic ${auth}` },
  });

  if (!res.ok || !res.body) {
    return new NextResponse("Failed to fetch recording from Twilio", { status: 502 });
  }

  return new NextResponse(res.body, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" },
  });
}
