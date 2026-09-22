import { CALLBACK_REASONS, CALL_OUTCOME_KEYS } from "./callOutcomes";

// Tool/function definitions given to the OpenAI Realtime model. These are
// how the deterministic parts of the spec (identity validation, data
// disclosure, callback escalation, payment instructions) stay deterministic
// application logic rather than left to the model's judgment — the model
// decides WHEN to call these, our server decides WHAT HAPPENS.
export const REALTIME_TOOLS = [
  {
    type: "function",
    name: "verify_identity",
    description:
      "Check whether a name the customer just gave matches the account on file. You MUST call this before disclosing any due date, amount, or other account-specific detail — never decide a name match yourself.",
    parameters: {
      type: "object",
      properties: {
        providedName: {
          type: "string",
          description: "The name exactly as the customer said it",
        },
      },
      required: ["providedName"],
    },
  },
  {
    type: "function",
    name: "record_promise_to_pay",
    description:
      "Record when the customer indicates a timeframe for payment, however vague (today, tonight, Friday, after work, later).",
    parameters: {
      type: "object",
      properties: {
        customerStatementVerbatim: {
          type: "string",
          description: "What the customer said, as close to verbatim as possible",
        },
        normalizedDateTime: {
          type: "string",
          description:
            "Best-effort ISO 8601 date or datetime this corresponds to (e.g. 2026-09-25). Omit if genuinely unclear.",
        },
      },
      required: ["customerStatementVerbatim"],
    },
  },
  {
    type: "function",
    name: "mark_already_paid",
    description: "Call when the customer says they have already paid.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "record_payment_instructions_given",
    description:
      "Call immediately AFTER you have read the approved PayNow payment instructions out to the customer.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "create_callback_task",
    description:
      "Escalate to a human staff member. Use whenever the conversation moves outside a plain reminder: negotiation, instalments, settlement, disputes, a third party on the line, identity that didn't match, uncertainty about how to answer, or anything else out of scope. Summarize the call so far before calling this.",
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
          description: "Concise summary of the call so far, for the staff member who follows up",
        },
        customerStatement: {
          type: "string",
          description: "The specific thing the customer said that triggered this, verbatim if possible",
        },
      },
      required: ["reason", "summary"],
    },
  },
  {
    type: "function",
    name: "end_call",
    description:
      "Call exactly once, right before you stop speaking for the last time, to close out the call record.",
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
