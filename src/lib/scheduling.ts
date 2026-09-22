// Public-holiday advance-call rule (spec section 5): "For payments falling
// on Singapore public holidays, customers may be called in advance instead.
// The exact public-holiday advance rule should be configurable rather than
// hard-coded."
//
// This is plain config, not env/secrets — edit the values below as SG's
// gazetted public holidays are published each year, or move this to a
// staff-editable settings table once the dashboard needs it.

export const SG_PUBLIC_HOLIDAYS_2026: string[] = [
  "2026-01-01", // New Year's Day
  "2026-02-17", // Chinese New Year
  "2026-02-18", // Chinese New Year
  "2026-03-21", // Hari Raya Puasa
  "2026-04-03", // Good Friday
  "2026-05-01", // Labour Day
  "2026-05-27", // Hari Raya Haji
  "2026-05-31", // Vesak Day
  "2026-08-09", // National Day
  "2026-11-08", // Deepavali
  "2026-12-25", // Christmas Day
];

export interface SchedulingConfig {
  /** How many days in advance to call when the due date falls on a public holiday. */
  advanceDays: number;
  /** ISO (YYYY-MM-DD) dates treated as Singapore public holidays. */
  publicHolidays: string[];
}

export const DEFAULT_SCHEDULING_CONFIG: SchedulingConfig = {
  advanceDays: 1,
  publicHolidays: SG_PUBLIC_HOLIDAYS_2026,
};

/** Returns the date a call should actually be placed for a given due date. */
export function getEffectiveCallDate(dueDate: Date, config: SchedulingConfig): Date {
  const iso = dueDate.toISOString().slice(0, 10);
  if (!config.publicHolidays.includes(iso)) return dueDate;

  const advanced = new Date(dueDate);
  advanced.setUTCDate(advanced.getUTCDate() - config.advanceDays);
  return advanced;
}
