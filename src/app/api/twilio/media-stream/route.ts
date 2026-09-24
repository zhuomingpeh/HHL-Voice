import { experimental_upgradeWebSocket } from "@vercel/functions";
import WebSocket from "ws";
import { prisma } from "@/lib/prisma";
import { buildSystemPrompt } from "@/lib/systemPrompt";
import { REALTIME_TOOLS } from "@/lib/realtimeTools";
import { CALL_OUTCOME_KEYS } from "@/lib/callOutcomes";
import { getAgentSettings } from "@/lib/agentSettings";
import type { Prisma, CustomerRecord, AgentSettings } from "@prisma/client";

export const maxDuration = 300;

// Hard cap on conversation length, per spec ("max convo duration is 3 mins").
// The system prompt also asks the model to wrap up on its own — this is the
// backstop in case it doesn't.
const MAX_CALL_MS = 3 * 60 * 1000;

// gpt-realtime-2.1-mini: distilled reasoning model, tool use + function
// calling, ~1/3 the cost of full gpt-realtime-2.1. Our script is a simple
// 4-branch decision, not open-ended reasoning, so the mini tier is the right
// fit — bump to gpt-realtime-2.1 only if live testing shows it mishandling
// branch selection or tool-call timing.
const OPENAI_REALTIME_URL = "wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1-mini";

// PCMU (g711 mu-law) is 1 byte per sample at 8000 samples/sec — exactly
// Twilio's native telephony format, so audio bytes forward straight through
// with no transcoding. Used to convert bytes sent -> real playback duration,
// so end_call can wait for audio to actually finish before hanging up.
const PCMU_BYTES_PER_MS = 8;

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
    let agentSettings: AgentSettings | null = null;
    let openaiWs: WebSocket | null = null;
    let callEnded = false;
    let hardTimeout: ReturnType<typeof setTimeout> | null = null;
    const transcript: TranscriptEntry[] = [];
    const bufferedMedia: string[] = [];
    // The customer's audio is withheld from OpenAI until the opening line
    // has fully finished — see the comment on openingLineTimeout below for
    // why. Everything that arrives before then queues here instead.
    let openingLineDone = false;
    let openingLineTimeout: ReturnType<typeof setTimeout> | null = null;
    let transcriptBuffer = "";
    // Bumped on every barge-in. Each response's audio is tagged with the
    // generation active when it started (currentResponseGeneration); if a
    // barge-in bumps playbackGeneration mid-stream, any further deltas for
    // that now-stale response are dropped instead of forwarded to Twilio.
    let playbackGeneration = 0;
    let currentResponseGeneration = 0;
    // Tracks whether OpenAI currently has a response in flight, so barge-in
    // only sends response.cancel when there's actually something to cancel —
    // otherwise OpenAI returns a "response_cancel_not_active" error (harmless
    // noise, but worth avoiding). OpenAI's own server-side turn detection
    // already auto-cancels the in-flight response when it detects the
    // customer speaking (observed directly in production logs, response.done
    // with status "cancelled"/reason "turn_detected") — our own cancel call
    // is a redundant belt-and-suspenders, not the primary mechanism.
    let responseActive = false;
    // Reset per response.created, set true the moment that response forwards
    // any real audio to Twilio. The self-diagnostic harness (scripts/test-
    // agent-conversation.ts) caught a real case of the model calling end_call
    // with ZERO spoken output beforehand — a silent hangup, which the
    // prompt's strict rules forbid but don't reliably prevent on their own.
    // This is the code-level backstop: if end_call fires without this having
    // been set, we prompt the model to say a brief closing line before we
    // actually hang up.
    let spokeThisResponse = false;
    // Total PCMU bytes forwarded for the current response — converted to a
    // playback-duration wait before hanging up, so end_call doesn't cut off
    // the tail of whatever was just said.
    let audioBytesThisResponse = 0;
    // Resolved on the next response.done after being created — used to wait
    // for "the response currently in flight" to fully finish, including a
    // corrective one triggered after the fact (see end_call handling).
    let pendingResponseDoneResolvers: Array<() => void> = [];
    function waitForResponseDone(): Promise<void> {
      return new Promise((resolve) => pendingResponseDoneResolvers.push(resolve));
    }

    function logTranscript(role: string, text: string) {
      if (!text) return;
      transcript.push({ role, text, timestamp: new Date().toISOString() });
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

    function closeConnections() {
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
    }

    async function handleFunctionCall(name: string, toolCallId: string, argsRaw: string) {
      if (!callId || !record || !openaiWs) return;
      const recordId = record.id;
      const activeCallId = callId;
      const ws = openaiWs;

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

            // Let the response containing this end_call call finish
            // streaming its audio (it may not be fully done yet — function
            // calls can complete before the rest of the response has).
            await waitForResponseDone();

            // Safety net: never hang up in silence. Rather than a hardcoded
            // (necessarily English) fallback line, ask the model itself to
            // say a brief closing — it already knows what language the call
            // has been in.
            if (!spokeThisResponse && ws.readyState === WebSocket.OPEN) {
              const fallbackDone = waitForResponseDone();
              ws.send(
                JSON.stringify({
                  type: "conversation.item.create",
                  item: {
                    type: "message",
                    role: "user",
                    content: [
                      {
                        type: "input_text",
                        text: "(automated note: you just tried to end the call without saying anything out loud — say a brief closing line now, in whichever language you were using, then nothing else)",
                      },
                    ],
                  },
                })
              );
              ws.send(JSON.stringify({ type: "response.create" }));
              await fallbackDone;
            }

            // <Connect><Stream> ties the call's fate to this connection, so
            // closing it is what actually ends the phone call. Wait for the
            // just-forwarded audio to finish playing (not just finish
            // sending) before hanging up.
            setTimeout(closeConnections, audioBytesThisResponse / PCMU_BYTES_PER_MS + 300);
            break;
          }
          default:
            result = { error: "unknown function" };
        }
      } catch (err) {
        console.error(`[media-stream] tool "${name}" failed`, err);
        result = { error: "internal error handling tool call" };
      }

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: { type: "function_call_output", call_id: toolCallId, output: JSON.stringify(result) },
          })
        );
        if (name !== "end_call") {
          ws.send(JSON.stringify({ type: "response.create" }));
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

      function finishOpeningLine() {
        if (openingLineDone) return;
        openingLineDone = true;
        if (openingLineTimeout) clearTimeout(openingLineTimeout);
        for (const payload of bufferedMedia) {
          ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio: payload }));
        }
        bufferedMedia.length = 0;
      }

      ws.on("open", () => {
        const outstandingAmount = record!.outstandingAmount != null ? Number(record!.outstandingAmount) : null;

        ws.send(
          JSON.stringify({
            type: "session.update",
            session: {
              type: "realtime",
              model: "gpt-realtime-2.1-mini",
              // Native audio output — replaces the earlier text + ElevenLabs
              // pipeline. That extra hop (wait for full text, call ElevenLabs,
              // stream its response) added latency and meant barge-in only
              // stopped OUR playback loop, not the underlying generation.
              // Native audio streams directly from the model in the same
              // format Twilio needs (no transcoding) and gets OpenAI's own
              // server-side interruption handling for free.
              output_modalities: ["audio"],
              audio: {
                input: {
                  format: { type: "audio/pcmu" },
                  // Default silence_duration_ms (~500ms) was cutting people
                  // off mid-thought, especially when leaving a longer
                  // message — give noticeably more room for a natural pause.
                  turn_detection: { type: "server_vad", silence_duration_ms: 900 },
                  transcription: { model: "whisper-1" },
                },
                output: {
                  format: { type: "audio/pcmu" },
                  voice: agentSettings?.openaiVoice || "marin",
                },
              },
              instructions: buildSystemPrompt({
                name: record!.name,
                dueDate: record!.dueDate,
                outstandingAmount,
                openingLine: agentSettings?.openingLine ?? "",
                additionalContext: agentSettings?.additionalContext ?? "",
              }),
              tools: REALTIME_TOOLS,
            },
          })
        );

        // The opening line is now the model's own first turn (see
        // systemPrompt.ts) rather than fixed Twilio <Say> TwiML — trigger it
        // immediately so the call doesn't just sit in silence waiting for
        // the customer to speak first.
        //
        // Deliberately NOT forwarding customer audio yet (see finishOpeningLine
        // above / the "media" handler below). A real call showed OpenAI's own
        // server-side turn detection cancelling this very first response the
        // instant it heard ANYTHING from the customer's line — even just
        // "hello?" on pickup, which is completely normal — and retrying
        // several times before the opening line got through, taking 5-10s
        // and coming out in confusing fragments. Customer audio is queued
        // instead and only released to the model once the opening line has
        // actually finished (or a timeout fires, in case something goes
        // wrong) — after that, normal real-time listening/interruption
        // applies for the rest of the call as usual.
        ws.send(JSON.stringify({ type: "response.create" }));
        openingLineTimeout = setTimeout(finishOpeningLine, 8000);
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
        // log every event type except the high-volume per-chunk deltas so we
        // can confirm/correct event names against real traffic.
        if (
          event.type &&
          event.type !== "response.output_audio.delta" &&
          event.type !== "response.output_audio_transcript.delta"
        ) {
          console.log("[media-stream] openai event:", event.type);
        }

        switch (event.type) {
          case "response.created": {
            responseActive = true;
            spokeThisResponse = false;
            audioBytesThisResponse = 0;
            currentResponseGeneration = playbackGeneration;
            transcriptBuffer = "";
            break;
          }
          case "response.output_audio.delta": {
            if (currentResponseGeneration !== playbackGeneration) break; // stale — barged in since this response started
            if (!streamSid || twilioWs.readyState !== WebSocket.OPEN) break;
            const payload = event.delta as string | undefined;
            if (!payload) break;
            spokeThisResponse = true;
            audioBytesThisResponse += Buffer.byteLength(payload, "base64");
            twilioWs.send(JSON.stringify({ event: "media", streamSid, media: { payload } }));
            break;
          }
          case "response.output_audio_transcript.delta": {
            transcriptBuffer += (event.delta as string | undefined) ?? "";
            break;
          }
          case "response.output_audio_transcript.done": {
            const finalText = (event.transcript as string | undefined) ?? transcriptBuffer;
            transcriptBuffer = "";
            logTranscript("assistant", finalText);
            break;
          }
          case "response.done": {
            responseActive = false;
            if (!openingLineDone) finishOpeningLine();
            // Diagnostic: a response with no output at all (no audio, no
            // function call) means the model produced nothing for that
            // turn — surfaced as "the AI just went silent" on a real call.
            const response = event.response as { output?: unknown[] } | undefined;
            if (!response?.output || response.output.length === 0) {
              console.error("[media-stream] response.done with empty output — model said nothing", JSON.stringify(event.response));
            }
            const resolvers = pendingResponseDoneResolvers;
            pendingResponseDoneResolvers = [];
            resolvers.forEach((resolve) => resolve());
            break;
          }
          case "conversation.item.input_audio_transcription.completed": {
            logTranscript("customer", (event.transcript as string) ?? "");
            break;
          }
          case "input_audio_buffer.speech_started": {
            // Barge-in: bump the generation so any further audio deltas for
            // the response that was just interrupted get dropped instead of
            // forwarded, and clear whatever Twilio already has queued to
            // play. OpenAI's own server-side turn detection independently
            // auto-cancels the in-flight response — response.cancel here is
            // just a backstop for cases it doesn't, guarded so we don't spam
            // "no active response" errors when it already has.
            playbackGeneration++;
            transcriptBuffer = "";
            if (streamSid) {
              twilioWs.send(JSON.stringify({ event: "clear", streamSid }));
            }
            if (responseActive && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "response.cancel" }));
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
            ).then(closeConnections);
          }, MAX_CALL_MS);

          Promise.all([
            prisma.call.findUnique({ where: { id: callId }, include: { customerRecord: true } }),
            getAgentSettings(),
          ])
            .then(([call, settings]) => {
              if (!call) {
                console.error("[media-stream] call not found", callId);
                twilioWs.close();
                return;
              }
              record = call.customerRecord;
              agentSettings = settings;
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
          if (openaiWs && openaiWs.readyState === WebSocket.OPEN && openingLineDone) {
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
