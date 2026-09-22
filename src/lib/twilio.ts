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

// Builds an absolute URL Twilio can call back to, appending the Vercel
// Protection Bypass param so it isn't blocked by Deployment Protection.
// Only ever used for Twilio webhook URLs — never for dashboard links.
export function buildTwilioWebhookUrl(path: string, params: Record<string, string>): string {
  const base = process.env.APP_BASE_URL;
  if (!base) throw new Error("APP_BASE_URL is not set");

  const url = new URL(path, base);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass) url.searchParams.set("x-vercel-protection-bypass", bypass);

  return url.toString();
}

// Same idea as buildTwilioWebhookUrl but for the wss:// Media Streams URL
// Twilio's <Connect><Stream> opens a live, bidirectional connection to.
export function buildTwilioMediaStreamUrl(path: string, params: Record<string, string>): string {
  const httpsUrl = buildTwilioWebhookUrl(path, params);
  return httpsUrl.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://");
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
