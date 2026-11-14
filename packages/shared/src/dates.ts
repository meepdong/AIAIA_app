/**
 * Dates are timestamptz in the database and shown in Asia/Kolkata (UTC+05:30, no DST).
 * The offset is fixed, so formatting is done by arithmetic: deterministic on every device.
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface KolkataParts {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function toDate(value: Date | string | number): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Invalid date: ${String(value)}`);
  }
  return date;
}

/** Calendar parts of an instant, as seen in Asia/Kolkata. */
export function toKolkataParts(value: Date | string | number): KolkataParts {
  const shifted = new Date(toDate(value).getTime() + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

/** e.g. "13 Nov 2026" */
export function formatDate(value: Date | string | number): string {
  const p = toKolkataParts(value);
  return `${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
}

/** e.g. "13 Nov 2026, 3:45 pm" */
export function formatDateTime(value: Date | string | number): string {
  const p = toKolkataParts(value);
  const meridiem = p.hour >= 12 ? 'pm' : 'am';
  const hour12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${formatDate(value)}, ${hour12}:${String(p.minute).padStart(2, '0')} ${meridiem}`;
}

function parseDob(dob: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob);
  if (!match) throw new RangeError(`dob must be YYYY-MM-DD, got "${dob}"`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/**
 * Whole years of age on the Kolkata calendar day of `today`.
 * A 29 Feb birthday counts from 1 Mar in non-leap years.
 */
export function ageOn(dob: string, today: Date | string | number = new Date()): number {
  const b = parseDob(dob);
  const t = toKolkataParts(today);
  const hadBirthday = t.month > b.month || (t.month === b.month && t.day >= b.day);
  return t.year - b.year - (hadBirthday ? 0 : 1);
}

/** Under 18, computed from the date of birth. The 18th birthday itself is not a minor. */
export function isMinor(dob: string, today: Date | string | number = new Date()): boolean {
  return ageOn(dob, today) < 18;
}
