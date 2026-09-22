// Extracts an outstanding amount from a free-text Remarks field — ONLY when
// unambiguous. Per spec: the AI must never guess, calculate, infer, or
// invent an amount. If extraction is uncertain, this returns null and the
// AI must treat the amount as unknown.

const CURRENCY_PATTERN = /(?:S\$|SGD|\$)\s?([\d,]+(?:\.\d{1,2})?)/gi;
const KEYWORD_PATTERN =
  /(?:amount|outstanding|owing|owes?|balance)\s*[:\-]?\s*\$?\s?([\d,]+(?:\.\d{1,2})?)/gi;

function extractDistinctAmounts(text: string, pattern: RegExp): number[] {
  const matches = [...text.matchAll(pattern)];
  const values = matches.map((m) => Number(m[1].replace(/,/g, "")));
  return [...new Set(values)];
}

export function extractOutstandingAmount(remarks: string | null | undefined): number | null {
  if (!remarks) return null;

  const currencyAmounts = extractDistinctAmounts(remarks, CURRENCY_PATTERN);
  if (currencyAmounts.length === 1) return currencyAmounts[0];
  if (currencyAmounts.length > 1) return null; // ambiguous — don't guess

  const keywordAmounts = extractDistinctAmounts(remarks, KEYWORD_PATTERN);
  if (keywordAmounts.length === 1) return keywordAmounts[0];

  return null;
}
