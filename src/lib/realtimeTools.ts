import { CALLBACK_REASONS, CALL_OUTCOME_KEYS } from "./callOutcomes";

// Minimal tool set for the "for now" scripted flow (see systemPrompt.ts) —
// deliberately cut down from a richer set (identity verification, promise-
// to-pay dates, payment instructions) after live testing showed the model
// following a longer, more open-ended prompt unreliably. Re-expand this
// once the simple script is solid.
export const REALTIME_TOOLS = [
  {
    type: "function",
    name: "create_callback_task",
    description:
      "Call after the customer has finished leaving their message (anything other than a plain 'yes, paying today'). Summarize the call so far before calling this.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          enum: CALLBACK_REASONS.map((r) => r.key),
          description: "The closest matching reason category",
        },
        summary: {
          type: "string",
          description: "Concise summary of the message, for the staff member who follows up",
        },
        customerStatement: {
          type: "string",
          description: "What the customer said, as close to verbatim as possible",
        },
      },
      required: ["reason", "summary"],
    },
  },
  {
    type: "function",
    name: "end_call",
    description:
      "Call exactly once, right before you stop speaking, to close out the call record.",
    parameters: {
      type: "object",
      properties: {
        outcome: { type: "string", enum: CALL_OUTCOME_KEYS },
        summary: { type: "string", description: "One or two sentence summary of how the call went" },
      },
      required: ["outcome", "summary"],
    },
  },
];
