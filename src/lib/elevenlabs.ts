// ElevenLabs client for voice cloning + streaming TTS. Used to replace
// OpenAI Realtime's built-in voice with a cloned custom voice — OpenAI still
// handles understanding + business logic (tool calls), configured to output
// text instead of audio; this module turns that text into speech.
//
// output_format "ulaw_8000" matches Twilio's telephony audio format (g711
// mu-law, 8kHz) exactly, so audio bytes can be forwarded to Twilio directly
// with no transcoding — same reason gpt-realtime uses "audio/pcmu" natively.

const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io";

function getApiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set");
  return key;
}

export interface CloneVoiceResult {
  voiceId: string;
}

/**
 * Creates an Instant Voice Clone from an audio sample.
 * @param audioBuffer Raw audio file bytes (mp3/wav/etc, 30s-5min recommended)
 * @param filename Original filename (used for content-type inference)
 * @param name Display name for the cloned voice in the ElevenLabs dashboard
 */
export async function cloneVoice(
  audioBuffer: Buffer,
  filename: string,
  name: string
): Promise<CloneVoiceResult> {
  const formData = new FormData();
  formData.append("name", name);
  formData.append("remove_background_noise", "true");
  formData.append("files", new Blob([new Uint8Array(audioBuffer)]), filename);

  const res = await fetch(`${ELEVENLABS_BASE_URL}/v1/voices/add`, {
    method: "POST",
    headers: { "xi-api-key": getApiKey() },
    body: formData,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ElevenLabs voice clone failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { voice_id: string };
  return { voiceId: data.voice_id };
}

/**
 * Streams synthesized speech for the given text, in ulaw_8000 format
 * (ready to forward straight to Twilio Media Streams). Returns the raw
 * response body stream — caller reads chunks and base64-encodes each for
 * Twilio's `media` event payload.
 */
export async function streamTextToSpeech(
  voiceId: string,
  text: string
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(
    `${ELEVENLABS_BASE_URL}/v1/text-to-speech/${voiceId}/stream?output_format=ulaw_8000`,
    {
      method: "POST",
      headers: {
        "xi-api-key": getApiKey(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2", // supports English/Mandarin
        // Tuned against the user's real cloned voice sample — default
        // settings sounded rougher/less natural.
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(`ElevenLabs TTS stream failed (${res.status}): ${body}`);
  }

  return res.body;
}
