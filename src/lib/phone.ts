import { parsePhoneNumberFromString } from "libphonenumber-js";

// Customers are Singapore-based; bare local numbers (e.g. "91234567") are
// assumed to be SG numbers unless the CSV already includes a country code.
const DEFAULT_REGION = "SG";

export function normalizePhoneNumber(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const parsed = parsePhoneNumberFromString(trimmed, DEFAULT_REGION);
  if (!parsed || !parsed.isValid()) return null;

  return parsed.number; // E.164, e.g. +6591234567
}
