// Due Date parsing for uploaded CSVs.
//
// Accepted formats (Singapore-friendly, unambiguous):
//   YYYY-MM-DD   e.g. 2026-09-25
//   DD/MM/YYYY   e.g. 25/09/2026
//   DD-MM-YYYY   e.g. 25-09-2026
//
// Deliberately does NOT accept MM/DD/YYYY: mixing that with DD/MM/YYYY is
// how silent date corruption happens (e.g. "03/04" meaning two different
// days depending on convention). Reject rather than guess.

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const DMY = /^(\d{2})[/-](\d{2})[/-](\d{4})$/;

export function parseDueDate(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let year: number, month: number, day: number;

  const isoMatch = ISO.exec(trimmed);
  const dmyMatch = DMY.exec(trimmed);

  if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else if (dmyMatch) {
    day = Number(dmyMatch[1]);
    month = Number(dmyMatch[2]);
    year = Number(dmyMatch[3]);
  } else {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  // Guards against e.g. 31/02/2026 rolling over into March.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}
