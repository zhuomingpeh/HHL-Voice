import Twilio from "twilio";

export interface TwilioConfig {
  accountSid: string;
  apiKeySid: string;
  apiKeySecret: string;
  phoneNumber: string;
}

export function getTwilioConfig(): TwilioConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !apiKeySid || !apiKeySecret || !phoneNumber) return null;
  return { accountSid, apiKeySid, apiKeySecret, phoneNumber };
}

export function getTwilioClient(config: TwilioConfig) {
  return Twilio(config.apiKeySid, config.apiKeySecret, { accountSid: config.accountSid });
}

// Builds an absolute URL Twilio can call back to. Uses TWILIO_WEBHOOK_BASE_URL
// — a dedicated domain (on a non-production git branch) that's exempted from
// Vercel Deployment Protection, since Vercel's protection can't be satisfied
// on the Media Streams WebSocket handshake at all (Twilio's <Stream> url
// doesn't support query params, and there's no way to attach a custom
// header either). Security for these routes comes entirely from Twilio's
// own request-signature validation (isValidTwilioRequest below) instead —
// this domain serves no dashboard pages, only /api/twilio/* routes.
export function buildTwilioWebhookUrl(path: string, params: Record<string, string>): string {
  const base = process.env.TWILIO_WEBHOOK_BASE_URL;
  if (!base) throw new Error("TWILIO_WEBHOOK_BASE_URL is not set");

  const url = new URL(path, base);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

// Same base domain, but as a bare wss:// URL with NO query string — Twilio's
// <Stream> url attribute doesn't support query params at all. Anything the
// stream handler needs (e.g. callId) must go through <Parameter> elements
// instead, delivered in the "start" WebSocket message.
export function buildTwilioMediaStreamUrl(path: string): string {
  const base = process.env.TWILIO_WEBHOOK_BASE_URL;
  if (!base) throw new Error("TWILIO_WEBHOOK_BASE_URL is not set");

  const url = new URL(path, base);
  return url.toString().replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://");
}

// Validates that an incoming request genuinely came from Twilio. Requires
// TWILIO_AUTH_TOKEN (the Account Auth Token — NOT the API Key secret, which
// isn't usable for signature validation). Until that's set, this logs a
// loud warning and allows the request through, since we don't yet have real
// calls to protect — this MUST be resolved before dialing out for real.
export async function isValidTwilioRequest(
  requestUrl: string,
  params: Record<string, string>,
  signature: string | null
): Promise<boolean> {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.warn(
      "[twilio] TWILIO_AUTH_TOKEN is not set — skipping webhook signature validation. " +
        "Set it before any real call dispatch."
    );
    return true;
  }
  if (!signature) return false;

  return Twilio.validateRequest(authToken, signature, requestUrl, params);
}
