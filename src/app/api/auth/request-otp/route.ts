import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { generateOtpCode, hashCode, isAllowedEmail, signPendingOtp } from "@/lib/auth";
import { sendOtpEmail } from "@/lib/email";

const OTP_TTL_MS = 10 * 60 * 1000;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";

  // Always return the same generic response whether or not the email is
  // allowed, so this endpoint can't be used to enumerate valid staff emails.
  const genericResponse = NextResponse.json({
    message: "If that email is authorized, a login code has been sent.",
  });

  if (!email || !isAllowedEmail(email)) {
    return genericResponse;
  }

  const code = generateOtpCode();
  const codeHash = await hashCode(code, email);
  const token = await signPendingOtp({
    email,
    codeHash,
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
  });

  try {
    await sendOtpEmail(email, code);
  } catch (err) {
    console.error("Failed to send OTP email", err);
    return NextResponse.json({ error: "Failed to send login email" }, { status: 500 });
  }

  const cookieStore = await cookies();
  cookieStore.set("pending_otp", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: OTP_TTL_MS / 1000,
  });

  return genericResponse;
}
