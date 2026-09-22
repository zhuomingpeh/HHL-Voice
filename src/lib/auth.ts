// Stateless, signed-cookie auth: no session table, so it works cleanly on
// serverless (Vercel functions don't share memory between invocations).
//
// Two cookie types, both HMAC-SHA256 signed with SESSION_SECRET so the
// client can't forge or tamper with them:
//   - pending_otp: short-lived, set after requesting a code, holds the
//     salted hash of the code (never the code itself) plus the target email.
//   - session: long-lived (sliding), set after a correct code, holds the
//     logged-in email + last-activity timestamp.

const encoder = new TextEncoder();

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return secret;
}

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let str = "";
  for (const b of buf) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlToBytes(b64url: string): ArrayBuffer {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    b64url.length + ((4 - (b64url.length % 4)) % 4),
    "="
  );
  const str = atob(b64);
  return Uint8Array.from(str, (c) => c.charCodeAt(0)).buffer;
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function sign(payload: object): Promise<string> {
  const key = await hmacKey(getSecret());
  const body = base64url(encoder.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return `${body}.${base64url(sig)}`;
}

async function verify<T>(token: string): Promise<T | null> {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const key = await hmacKey(getSecret());
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64urlToBytes(sig),
    encoder.encode(body)
  );
  if (!valid) return null;

  try {
    return JSON.parse(new TextDecoder().decode(base64urlToBytes(body))) as T;
  } catch {
    return null;
  }
}

export async function hashCode(code: string, email: string): Promise<string> {
  const key = await hmacKey(getSecret());
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(`${email}:${code}`));
  return base64url(sig);
}

// --- Pending OTP (between "request code" and "verify code") ---

export interface PendingOtpPayload {
  email: string;
  codeHash: string;
  expiresAt: number; // epoch ms
  attempts: number;
}

export async function signPendingOtp(payload: PendingOtpPayload): Promise<string> {
  return sign(payload);
}

export async function verifyPendingOtp(token: string): Promise<PendingOtpPayload | null> {
  const payload = await verify<PendingOtpPayload>(token);
  if (!payload) return null;
  if (payload.expiresAt < Date.now()) return null;
  return payload;
}

// --- Session (after a correct code) ---

export interface SessionPayload {
  email: string;
  lastActivity: number; // epoch ms
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return sign(payload);
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  const payload = await verify<SessionPayload>(token);
  if (!payload) return null;

  const inactivitySeconds = Number(process.env.SESSION_INACTIVITY_SECONDS ?? "3600");
  const expired = Date.now() - payload.lastActivity > inactivitySeconds * 1000;
  if (expired) return null;

  return payload;
}

export function isAllowedEmail(email: string): boolean {
  const allowed = (process.env.ALLOWED_LOGIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}

export function generateOtpCode(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const code = (array[0] % 1_000_000).toString().padStart(6, "0");
  return code;
}
