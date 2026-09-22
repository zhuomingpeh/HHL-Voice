import { NextRequest, NextResponse } from "next/server";
import { signSession, verifySession } from "@/lib/auth";

const PUBLIC_PATHS = ["/login"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Twilio webhooks can't do email OTP — they're gated separately by the
  // Vercel Protection Bypass secret + Twilio request-signature validation.
  if (pathname.startsWith("/api/twilio/")) return NextResponse.next();
  if (pathname.startsWith("/api/auth/")) return NextResponse.next();
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();

  const token = req.cookies.get("session")?.value;
  const session = token ? await verifySession(token) : null;

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Sliding expiration: refresh lastActivity on every authenticated request.
  const response = NextResponse.next();
  const refreshed = await signSession({ email: session.email, lastActivity: Date.now() });
  response.cookies.set("session", refreshed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Number(process.env.SESSION_INACTIVITY_SECONDS ?? "3600"),
  });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
