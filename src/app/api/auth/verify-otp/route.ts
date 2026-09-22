import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { hashCode, signPendingOtp, signSession, verifyPendingOtp } from "@/lib/auth";

const MAX_ATTEMPTS = 5;
const SESSION_TTL_SECONDS = Number(process.env.SESSION_INACTIVITY_SECONDS ?? "3600");

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim() : "";

  const cookieStore = await cookies();
  const pendingToken = cookieStore.get("pending_otp")?.value;

  if (!pendingToken || !code) {
    return NextResponse.json({ error: "No login in progress. Request a new code." }, { status: 400 });
  }

  const pending = await verifyPendingOtp(pendingToken);
  if (!pending) {
    cookieStore.delete("pending_otp");
    return NextResponse.json({ error: "Code expired. Request a new one." }, { status: 400 });
  }

  if (pending.attempts >= MAX_ATTEMPTS) {
    cookieStore.delete("pending_otp");
    return NextResponse.json(
      { error: "Too many incorrect attempts. Request a new code." },
      { status: 429 }
    );
  }

  const submittedHash = await hashCode(code, pending.email);
  if (submittedHash !== pending.codeHash) {
    const retryToken = await signPendingOtp({ ...pending, attempts: pending.attempts + 1 });
    cookieStore.set("pending_otp", retryToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.max(0, Math.floor((pending.expiresAt - Date.now()) / 1000)),
    });
    return NextResponse.json({ error: "Incorrect code." }, { status: 400 });
  }

  const sessionToken = await signSession({ email: pending.email, lastActivity: Date.now() });
  cookieStore.delete("pending_otp");
  cookieStore.set("session", sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  return NextResponse.json({ ok: true });
}
