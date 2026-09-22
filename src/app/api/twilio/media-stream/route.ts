import { NextRequest } from "next/server";
import { experimental_upgradeWebSocket } from "@vercel/functions";
import WebSocket from "ws";
import { prisma } from "@/lib/prisma";
import { buildSystemPrompt } from "@/lib/systemPrompt";
import { REALTIME_TOOLS } from "@/lib/realtimeTools";
import { namesReasonablyMatch } from "@/lib/nameMatch";
import { CALL_OUTCOME_KEYS } from "@/lib/callOutcomes";
import type { Prisma } from "@prisma/client";

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

export async function GET(req: NextRequest) {
  const callId = req.nextUrl.searchParams.get("callId");

  return experimental_upgradeWebSocket(async (twilioWs) => {
    if (!callId) {
      twilioWs.close();
      return;
    }

    let call;
    try {
      call = await prisma.call.findUnique({
        where: { id: callId },
        include: { customerRecord: true },
      });
    } catch (err) {
      console.error("[media-stream] failed to load call", err);
      twilioWs.close();
      return;
    }
    if (!call) {
      twilioWs.close();
      return;
    }
    const record = call.customerRecord;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("[media-stream] OPENAI_API_KEY is not set");
      twilioWs.close();
      return;
    }

    let streamSid: string | null = null;
    let callEnded = false;
    let hardTimeout: ReturnType<typeof setTimeout> | null = null;
    const transcript: TranscriptEntry[] = [];

    function logTranscript(role: string, text: string) {
      if (!text) return;
      transcript.push({ role, text, timestamp: new Date().toISOString() });
    }

    async function finalizeCall(outcome: string | null, summary: string | null) {
      if (callEnded) return;
      callEnded = true;
      if (hardTimeout) clearTimeout(hardTimeout);
      try {
        await prisma.call.update({
          where: { id: callId as string },
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

    const openaiWs = new WebSocket(OPENAI_REALTIME_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    async function handleFunctionCall(name: string, toolCallId: string, argsRaw: string) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(argsRaw || "{}");
      } catch {
        // leave args empty
      }

      let result: Record<string, unknown> = { ok: true };

      try {
        switch (name) {
          case "verify_identity": {
            const providedName = typeof args.providedName === "string" ? args.providedName : "";
            const matches = namesReasonablyMatch(providedName, record.name);
            if (matches) {
              await prisma.call.update({ where: { id: callId as string }, data: { identityConfirmed: true } });
            }
            result = { matches };
            break;
          }
          case "record_promise_to_pay": {
            const raw = typeof args.customerStatementVerbatim === "string" ? args.customerStatementVerbatim : null;
            const normalizedRaw = typeof args.normalizedDateTime === "string" ? args.normalizedDateTime : null;
            const normalized = normalizedRaw ? new Date(normalizedRaw) : null;
            await prisma.call.update({
              where: { id: callId as string },
              data: {
                promiseToPayRaw: raw,
                promiseToPayNormalized: normalized && !isNaN(normalized.getTime()) ? normalized : null,
              },
            });
            break;
          }
          case "mark_already_paid": {
            await prisma.call.update({ where: { id: callId as string }, data: { outcome: "ALREADY_PAID" } });
            break;
          }
          case "record_payment_instructions_given": {
            await prisma.call.update({
              where: { id: callId as string },
              data: { paymentInstructionsRequested: true, paymentInstructionsSent: true },
            });
            break;
          }
          case "create_callback_task": {
            const reason = typeof args.reason === "string" ? args.reason : "OUT_OF_SCOPE";
            const summary = typeof args.summary === "string" ? args.summary : null;
            const customerStatement = typeof args.customerStatement === "string" ? args.customerStatement : null;
            await prisma.call.update({
              where: { id: callId as string },
              data: { callbackRequired: true, callbackReason: reason },
            });
            await prisma.callbackTask.create({
              data: {
                customerRecordId: record.id,
                callId: callId as string,
                reason,
                summary,
                customerStatement,
              },
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

    openaiWs.on("open", () => {
      const outstandingAmount =
        record.outstandingAmount != null ? Number(record.outstandingAmount) : null;

      openaiWs.send(
        JSON.stringify({
          type: "session.update",
          session: {
            type: "realtime",
            model: "gpt-realtime",
            output_modalities: ["audio"],
            audio: {
              input: {
                format: { type: "audio/pcmu" },
                turn_detection: { type: "server_vad" },
              },
              output: {
                format: { type: "audio/pcmu" },
                voice: "marin",
              },
            },
            instructions: buildSystemPrompt({
              name: record.name,
              dueDate: record.dueDate,
              outstandingAmount,
            }),
            tools: REALTIME_TOOLS,
          },
        })
      );
      // Nudge the model to speak first (it's an outbound call — the
      // customer just picked up and is waiting to hear from us).
      openaiWs.send(JSON.stringify({ type: "response.create" }));
    });

    openaiWs.on("message", (raw) => {
      let event: { type?: string; [key: string]: unknown };
      try {
        event = JSON.parse(raw.toString());
      } catch {
        return;
      }

      switch (event.type) {
        case "response.output_audio.delta": {
          const delta = event.delta as string | undefined;
          if (streamSid && delta) {
            twilioWs.send(JSON.stringify({ event: "media", streamSid, media: { payload: delta } }));
          }
          break;
        }
        case "response.output_audio_transcript.done": {
          logTranscript("assistant", (event.transcript as string) ?? "");
          break;
        }
        case "conversation.item.input_audio_transcription.completed": {
          logTranscript("customer", (event.transcript as string) ?? "");
          break;
        }
        case "input_audio_buffer.speech_started": {
          // Barge-in: clear whatever Twilio has queued to play so the
          // customer doesn't keep hearing the assistant talk over them.
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

    openaiWs.on("error", (err) => {
      console.error("[media-stream] OpenAI websocket error", err);
    });

    openaiWs.on("close", () => {
      finalizeCall(null, null).catch(() => {});
      try {
        twilioWs.close();
      } catch {
        // already closed
      }
    });

    twilioWs.on("message", (raw) => {
      let msg: { event?: string; [key: string]: unknown };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      switch (msg.event) {
        case "start": {
          const start = msg.start as { streamSid?: string } | undefined;
          streamSid = start?.streamSid ?? null;
          hardTimeout = setTimeout(() => {
            finalizeCall(
              "CALL_FAILED",
              "Call automatically ended after reaching the 3-minute limit without the AI calling end_call."
            ).then(() => {
              try {
                openaiWs.close();
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
          break;
        }
        case "media": {
          const media = msg.media as { payload?: string } | undefined;
          if (media?.payload && openaiWs.readyState === WebSocket.OPEN) {
            openaiWs.send(JSON.stringify({ type: "input_audio_buffer.append", audio: media.payload }));
          }
          break;
        }
        case "stop": {
          finalizeCall(null, null).catch(() => {});
          try {
            openaiWs.close();
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
        openaiWs.close();
      } catch {
        // already closed
      }
    });

    twilioWs.on("error", (err) => {
      console.error("[media-stream] Twilio websocket error", err);
    });
  });
}
