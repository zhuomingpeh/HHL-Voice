// Temporary call outcome categories (spec section 15). Deliberately a plain
// TS list rather than a Prisma enum or hardcoded DB constraint, so staff can
// add/rename/merge categories later without a schema migration.

export interface CallOutcomeDef {
  key: string;
  label: string;
}

export const CALL_OUTCOMES: CallOutcomeDef[] = [
  { key: "ANSWERED", label: "Answered" },
  { key: "NO_ANSWER", label: "No Answer" },
  { key: "LEFT_VOICEMAIL", label: "Left Voicemail" },
  { key: "PROMISE_TO_PAY", label: "Promise to Pay" },
  { key: "ALREADY_PAID", label: "Already Paid" },
  { key: "CALLBACK_REQUIRED", label: "Callback Required" },
  { key: "WRONG_NUMBER", label: "Wrong Number" },
  { key: "THIRD_PARTY_ANSWERED", label: "Third Party Answered" },
  { key: "PAYMENT_INSTRUCTIONS_REQUESTED", label: "Payment Instructions Requested" },
  { key: "CALL_FAILED", label: "Call Failed" },
];

export const CALL_OUTCOME_KEYS = CALL_OUTCOMES.map((o) => o.key);

export function callOutcomeLabel(key: string | null | undefined): string {
  if (!key) return "—";
  return CALL_OUTCOMES.find((o) => o.key === key)?.label ?? key;
}

// Callback task reasons (spec section 13). Same rationale — plain data, not
// an enum, so the list can evolve freely.
export const CALLBACK_REASONS: CallOutcomeDef[] = [
  { key: "NOT_PAYING_TODAY", label: "Customer did not confirm payment today — left a message" },
  { key: "REQUESTED_STAFF", label: "Customer requested a staff member" },
  { key: "WANTS_NEGOTIATION", label: "Customer wants to negotiate" },
  { key: "WANTS_INSTALMENTS", label: "Customer requested instalments / alternative arrangement" },
  { key: "WANTS_SETTLEMENT", label: "Customer asked for settlement" },
  { key: "DISPUTES_AMOUNT", label: "Customer disputes the amount" },
  { key: "DISPUTES_DEBT", label: "Customer disputes the debt" },
  { key: "RECORDS_INCORRECT", label: "Customer says records are incorrect" },
  { key: "NEW_LOAN_ENQUIRY", label: "Customer asked about a new loan" },
  { key: "REFINANCING_ENQUIRY", label: "Customer asked about refinancing" },
  { key: "OTHER_ACCOUNT_ENQUIRY", label: "Customer asked about another customer's account" },
  { key: "FAMILY_ACCOUNT_ENQUIRY", label: "Customer asked about spouse/family member's debt" },
  { key: "IDENTITY_NOT_CONFIRMED", label: "Identity could not be confirmed" },
  { key: "INFO_UNAVAILABLE", label: "Requested information unavailable" },
  { key: "AI_UNCERTAIN", label: "AI was uncertain how to answer" },
  { key: "THIRD_PARTY_ANSWERED", label: "Someone other than the customer answered" },
  { key: "OUT_OF_SCOPE", label: "Situation outside payment-reminder scope" },
];
