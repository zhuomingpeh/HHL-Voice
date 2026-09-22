import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete("session");
  cookieStore.delete("pending_otp");
  return NextResponse.json({ ok: true });
}
