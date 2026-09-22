import Papa from "papaparse";
import { normalizePhoneNumber } from "./phone";
import { parseDueDate } from "./dates";
import { extractOutstandingAmount } from "./amount";

export interface ParsedCsvRow {
  rowNumber: number; // 1-based, matches the row's position in the data (excluding header)
  name: string;
  phoneNumberRaw: string;
  phoneNumberE164: string | null;
  dueDateRaw: string;
  dueDate: Date | null;
  remarks: string | null;
  outstandingAmount: number | null;
  isValid: boolean;
  errors: string[];
}

export interface ParsedCsvResult {
  rows: ParsedCsvRow[];
  emptyRowNumbers: number[];
  headerError: string | null;
}

const REQUIRED_HEADERS = ["name", "contact number", "due date", "remarks"];

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase();
}

function findColumn(headers: string[], target: string): string | undefined {
  const normalizedTarget = normalizeHeader(target);
  return headers.find((h) => normalizeHeader(h) === normalizedTarget);
}

export function parseCsv(fileContent: string): ParsedCsvResult {
  const parsed = Papa.parse<Record<string, string>>(fileContent, {
    header: true,
    skipEmptyLines: false,
    transformHeader: (h) => h.trim(),
  });

  const headers = parsed.meta.fields ?? [];
  const missingHeaders = REQUIRED_HEADERS.filter(
    (required) => !findColumn(headers, required)
  );

  if (missingHeaders.length > 0) {
    return {
      rows: [],
      emptyRowNumbers: [],
      headerError: `CSV is missing required column(s): ${missingHeaders.join(", ")}. Expected headers: Name, Contact Number, Due Date, Remarks.`,
    };
  }

  const nameCol = findColumn(headers, "name")!;
  const phoneCol = findColumn(headers, "contact number")!;
  const dueDateCol = findColumn(headers, "due date")!;
  const remarksCol = findColumn(headers, "remarks")!;

  const rows: ParsedCsvRow[] = [];
  const emptyRowNumbers: number[] = [];

  parsed.data.forEach((raw, index) => {
    const rowNumber = index + 1;

    const name = (raw[nameCol] ?? "").trim();
    const phoneNumberRaw = (raw[phoneCol] ?? "").trim();
    const dueDateRaw = (raw[dueDateCol] ?? "").trim();
    const remarksRaw = (raw[remarksCol] ?? "").trim();

    const isCompletelyEmpty = !name && !phoneNumberRaw && !dueDateRaw && !remarksRaw;
    if (isCompletelyEmpty) {
      emptyRowNumbers.push(rowNumber);
      return;
    }

    const errors: string[] = [];

    if (!name) errors.push("Missing name");

    if (!phoneNumberRaw) {
      errors.push("Missing contact number");
    }
    const phoneNumberE164 = phoneNumberRaw ? normalizePhoneNumber(phoneNumberRaw) : null;
    if (phoneNumberRaw && !phoneNumberE164) {
      errors.push("Invalid telephone number format");
    }

    if (!dueDateRaw) errors.push("Missing due date");
    const dueDate = dueDateRaw ? parseDueDate(dueDateRaw) : null;
    if (dueDateRaw && !dueDate) {
      errors.push("Invalid date format (use YYYY-MM-DD or DD/MM/YYYY)");
    }

    const remarks = remarksRaw || null;
    const outstandingAmount = extractOutstandingAmount(remarks);

    rows.push({
      rowNumber,
      name,
      phoneNumberRaw,
      phoneNumberE164,
      dueDateRaw,
      dueDate,
      remarks,
      outstandingAmount,
      isValid: errors.length === 0,
      errors,
    });
  });

  // Duplicate phone number check (across otherwise-valid rows only — a row
  // with no parseable number can't meaningfully be a "duplicate").
  const seenBy = new Map<string, ParsedCsvRow[]>();
  for (const row of rows) {
    if (!row.phoneNumberE164) continue;
    const group = seenBy.get(row.phoneNumberE164) ?? [];
    group.push(row);
    seenBy.set(row.phoneNumberE164, group);
  }
  for (const group of seenBy.values()) {
    if (group.length <= 1) continue;
    for (const row of group) {
      row.errors.push("Duplicate phone number within this file");
      row.isValid = false;
    }
  }

  return { rows, emptyRowNumbers, headerError: null };
}
