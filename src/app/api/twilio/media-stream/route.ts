import { experimental_upgradeWebSocket } from "@vercel/functions";
import WebSocket from "ws";
import { prisma } from "@/lib/prisma";
import { buildSystemPrompt } from "@/lib/systemPrompt";
import { REALTIME_TOOLS } from "@/lib/realtimeTools";
import { CALL_OUTCOME_KEYS } from "@/lib/callOutcomes";
import { streamTextToSpeech } from "@/lib/elevenlabs";
import type { Prisma, CustomerRecord } from "@prisma/client";

export const maxDuration = 300;

// Hard cap on conversation length, per spec ("max convo duration is 3 mins").
// The system prompt also asks the model to wrap up on its own — this is the
// backstop in case it doesn't.
const MAX_CALL_MS = 3 * 60 * 1000;

const OPENAI_REALTIME_URL = "wss://api.openai.com/v1/realtime?model=gpt-realtime";

interface TranscriptEntry {
  role: string;
  text: string;
  timestamp: string;
}

// Twilio's <Stream> url can't carry query params, so callId arrives via a
// <Parameter> element instead — delivered in the "start" message, not
// available until the WebSocket connection is already open. Everything that
// depends on it (loading the call/customer record, opening the OpenAI
// connection) is deferred until then.
export async function GET() {
  return experimental_upgradeWebSocket(async (twilioWs) => {
    let streamSid: string | null = null;
    let callId: string | null = null;
    let record: CustomerRecord | null = null;
    let openaiWs: WebSocket | null = null;
    let callEnded = false;
    let hardTimeout: ReturnType<typeof setTimeout> | null = null;
    const transcript: TranscriptEntry[] = [];
    const bufferedMedia: string[] = [];
    let responseTextBuffer = "";
    // Bumped on every barge-in; an in-flight TTS playback loop checks this
    // and stops sending audio to Twilio if it's gone stale, so we don't
    // keep talking over a customer who just started speaking.
    let playbackGeneration = 0;
    // Tracks the most recent speak() call so end_call can wait for the
    // closing line to actually finish playing before hanging up, instead of
    // a fixed guess — ElevenLabs streaming takes variable time per message.
    let activeSpeak: Promise<void> = Promise.resolve();

    function logTranscript(role: string, text: string) {
      if (!text) return;
      transcript.push({ role, text, timestamp: new Date().toISOString() });
    }

    async function speak(text: string) {
      if (!text.trim() || !streamSid) return;
      const voiceId = process.env.ELEVENLABS_VOICE_ID;
      if (!voiceId) {
        console.error("[media-stream] ELEVENLABS_VOICE_ID is not set");
        return;
      }
      logTranscript("assistant", text);

      const myGeneration = playbackGeneration;
      try {
        const stream = await streamTextToSpeech(voiceId, text);
        for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
          if (myGeneration !== playbackGeneration) break; // barged in — stop playing
          if (twilioWs.readyState !== WebSocket.OPEN) break;
          twilioWs.send(
            JSON.stringify({
              event: "media",
              streamSid,
              media: { payload: Buffer.from(chunk).toString("base64") },
            })
          );
        }
      } catch (err) {
        console.error("[media-stream] ElevenLabs TTS failed", err);
      }
    }

    async function finalizeCall(outcome: string | null, summary: string | null) {
      if (callEnded || !callId) return;
      callEnded = true;
      if (hardTimeout) clearTimeout(hardTimeout);
      try {
        await prisma.call.update({
          where: { id: callId },
          data: {
            endTime: new Date(),
            transcript: transcript as unknown as Prisma.InputJsonValue,
            ...(outcome ? { outcome } : {}),
            ...(summary ? { callSummary: summary } : {}),
          },
        });
      } catch (err) {
        console.error("[media-stream] failed to finalize call", err);
      }
    }

    async function handleFunctionCall(name: string, toolCallId: string, argsRaw: string) {
      if (!callId || !record || !openaiWs) return;
      const recordId = record.id;
      const activeCallId = callId;

      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(argsRaw || "{}");
      } catch {
        // leave args empty
      }

      let result: Record<string, unknown> = { ok: true };

      try {
        switch (name) {
          case "create_callback_task": {
            const reason = typeof args.reason === "string" ? args.reason : "OUT_OF_SCOPE";
            const summary = typeof args.summary === "string" ? args.summary : null;
            const customerStatement = typeof args.customerStatement === "string" ? args.customerStatement : null;
            await prisma.call.update({
              where: { id: activeCallId },
              data: { callbackRequired: true, callbackReason: reason },
            });
            await prisma.callbackTask.create({
              data: { customerRecordId: recordId, callId: activeCallId, reason, summary, customerStatement },
            });
            break;
          }
          case "end_call": {
            const outcome =
              typeof args.outcome === "string" && CALL_OUTCOME_KEYS.includes(args.outcome)
                ? args.outcome
                : "ANSWERED";
            const summary = typeof args.summary === "string" ? args.summary : null;
            await finalizeCall(outcome, summary);
            // Wait for the closing line's ElevenLabs playback to actually
            // finish before hanging up — <Connect><Stream> ties the call's
            // fate to this connection, so closing it is what ends the
            // phone call; finalizeCall above only updates our own records.
            activeSpeak
              .catch(() => {})
              .then(() => {
                setTimeout(() => {
                  try {
                    openaiWs?.close();
                  } catch {
                    // already closed
                  }
                  try {
                    twilioWs.close();
                  } catch {
                    // already closed
                  }
                }, 500); // small buffer for the last audio packet to flush through Twilio
              });
            break;
          }
          default:
            result = { error: "unknown function" };
        }
      } catch (err) {
        console.error(`[media-stream] tool "${name}" failed`, err);
        result = { error: "internal error handling tool call" };
      }

      if (openaiWs.readyState === WebSocket.OPEN) {
        openaiWs.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: { type: "function_call_output", call_id: toolCallId, output: JSON.stringify(result) },
          })
        );
        if (name !== "end_call") {
          openaiWs.send(JSON.stringify({ type: "response.create" }));
        }
      }
    }

    function connectToOpenAi() {
      if (!record) return;
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        console.error("[media-stream] OPENAI_API_KEY is not set");
        twilioWs.close();
        return;
      }

      const ws = new WebSocket(OPENAI_REALTIME_URL, { headers: { Authorization: `Bearer ${apiKey}` } });
      openaiWs = ws;

      ws.on("open", () => {
        const outstandingAmount = record!.outstandingAmount != null ? Number(record!.outstandingAmount) : null;

        ws.send(
          JSON.stringify({
            type: "session.update",
            session: {
              type: "realtime",
              model: "gpt-realtime",
              // Text only — OpenAI still does the listening/understanding
              // and all tool-calling, but speaking is handled by ElevenLabs
              // (the user's cloned voice) instead of gpt-realtime's own
              // built-in voice. See speak() above.
              output_modalities: ["text"],
              audio: {
                input: {
                  format: { type: "audio/pcmu" },
                  // Default silence_duration_ms (~500ms) was cutting people
                  // off mid-thought, especially when leaving a longer
                  // message — give noticeably more room for a natural pause.
                  turn_detection: { type: "server_vad", silence_duration_ms: 900 },
                  transcription: { model: "whisper-1" },
                },
              },
              instructions: buildSystemPrompt({
                name: record!.name,
                dueDate: record!.dueDate,
                outstandingAmount,
              }),
              tools: REALTIME_TOOLS,
            },
          })
        );
        // No "speak first" nudge here — the opening line and question were
        // already played as fixed Twilio <Say> TwiML before this connection
        // was made. The model's first turn should be reacting to whatever
        // the customer says in response to that.

        // Flush any caller audio that arrived while we were still connecting.
        for (const payload of bufferedMedia) {
          ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio: payload }));
        }
        bufferedMedia.length = 0;
      });

      ws.on("message", (raw) => {
        let event: { type?: string; [key: string]: unknown };
        try {
          event = JSON.parse(raw.toString());
        } catch {
          return;
        }

        // Temporary: the GA Realtime wire protocol isn't fully verified yet
        // (it changed meaningfully from the widely-documented 2024 beta) —
        // log every event type except the noisy per-chunk text delta so we
        // can confirm/correct event names against real traffic.
        if (event.type && event.type !== "response.output_text.delta") {
          console.log("[media-stream] openai event:", event.type);
        }

        switch (event.type) {
          case "response.output_text.delta": {
            responseTextBuffer += (event.delta as string | undefined) ?? "";
            break;
          }
          case "response.output_text.done": {
            const finalText =
              (event.text as string | undefined) ?? responseTextBuffer;
            responseTextBuffer = "";
            activeSpeak = speak(finalText).catch((err) =>
              console.error("[media-stream] speak() failed", err)
            );
            break;
          }
          case "conversation.item.input_audio_transcription.completed": {
            logTranscript("customer", (event.transcript as string) ?? "");
            break;
          }
          case "input_audio_buffer.speech_started": {
            // Barge-in: stop any in-flight ElevenLabs playback and clear
            // whatever Twilio has queued, so the customer doesn't keep
            // hearing the assistant talk over them.
            playbackGeneration++;
            if (streamSid) {
              twilioWs.send(JSON.stringify({ event: "clear", streamSid }));
            }
            break;
          }
          case "response.output_item.done": {
            const item = event.item as
              | { type?: string; name?: string; call_id?: string; arguments?: string }
              | undefined;
            if (item?.type === "function_call" && item.name && item.call_id) {
              handleFunctionCall(item.name, item.call_id, item.arguments ?? "{}").catch((err) =>
                console.error("[media-stream] unhandled function call error", err)
              );
            }
            break;
          }
          case "error": {
            console.error("[media-stream] OpenAI error event", JSON.stringify(event));
            break;
          }
          default:
            break; // ignore anything else — audio bridging keeps working regardless
        }
      });

      ws.on("error", (err) => {
        console.error("[media-stream] OpenAI websocket error", err);
      });

      ws.on("close", () => {
        finalizeCall(null, null).catch(() => {});
        try {
          twilioWs.close();
        } catch {
          // already closed
        }
      });
    }

    twilioWs.on("message", (raw) => {
      let msg: { event?: string; [key: string]: unknown };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      switch (msg.event) {
        case "start": {
          const start = msg.start as
            | { streamSid?: string; customParameters?: { callId?: string } }
            | undefined;
          streamSid = start?.streamSid ?? null;
          callId = start?.customParameters?.callId ?? null;

          if (!callId) {
            console.error("[media-stream] no callId in start event");
            twilioWs.close();
            return;
          }

          hardTimeout = setTimeout(() => {
            finalizeCall(
              "CALL_FAILED",
              "Call automatically ended after reaching the 3-minute limit without the AI calling end_call."
            ).then(() => {
              try {
                openaiWs?.close();
              } catch {
                // already closed
              }
              try {
                twilioWs.close();
              } catch {
                // already closed
              }
            });
          }, MAX_CALL_MS);

          prisma.call
            .findUnique({ where: { id: callId }, include: { customerRecord: true } })
            .then((call) => {
              if (!call) {
                console.error("[media-stream] call not found", callId);
                twilioWs.close();
                return;
              }
              record = call.customerRecord;
              connectToOpenAi();
            })
            .catch((err) => {
              console.error("[media-stream] failed to load call", err);
              twilioWs.close();
            });
          break;
        }
        case "media": {
          const media = msg.media as { payload?: string } | undefined;
          if (!media?.payload) break;
          if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
            openaiWs.send(JSON.stringify({ type: "input_audio_buffer.append", audio: media.payload }));
          } else {
            bufferedMedia.push(media.payload);
            if (bufferedMedia.length > 1000) bufferedMedia.shift(); // defensive cap
          }
          break;
        }
        case "stop": {
          finalizeCall(null, null).catch(() => {});
          try {
            openaiWs?.close();
          } catch {
            // already closed
          }
          break;
        }
        default:
          break;
      }
    });

    twilioWs.on("close", () => {
      finalizeCall(null, null).catch(() => {});
      try {
        openaiWs?.close();
      } catch {
        // already closed
      }
    });

    twilioWs.on("error", (err) => {
      console.error("[media-stream] Twilio websocket error", err);
    });
  });
}
