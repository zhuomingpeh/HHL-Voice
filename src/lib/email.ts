import { Resend } from "resend";

let client: Resend | null = null;

function getClient(): Resend {
  if (!client) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is not set");
    client = new Resend(apiKey);
  }
  return client;
}

export async function sendOtpEmail(email: string, code: string): Promise<void> {
  const result = await getClient().emails.send({
    // Resend's shared testing sender — works without a verified domain, but
    // can only deliver to the Resend account's own verified address(es).
    // Swap for a verified "from" domain before adding more staff logins.
    from: "HHL Credit <onboarding@resend.dev>",
    to: email,
    subject: `Your HHL Credit login code: ${code}`,
    text: `Your login code is ${code}. It expires in 10 minutes. If you didn't request this, ignore this email.`,
  });

  if (result.error) {
    throw new Error(`Failed to send OTP email: ${result.error.message}`);
  }
}
