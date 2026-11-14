/**
 * Age rules for profile setup. They mirror `submit_application` (under 14 refused, 35+ joins the
 * parent organisation) and the 18th-birthday handover. The database decides; this only picks the
 * right words and stops an obviously refused form early.
 */

/** Youngest age that may sign up with their own login. Below this a guardian adds them. */
export const TEEN_MIN_AGE = 14;
/** From this age the account is the member's own and no guardian is involved. */
export const ADULT_AGE = 18;
/** From this age a member joins the AIAIA (parent organisation) wing. */
export const AIAIA_MIN_AGE = 35;

export type AgeBand = 'blocked' | 'teen' | 'adult' | 'aiaia';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Today's calendar date in Asia/Kolkata, as `YYYY-MM-DD`. */
export function todayIst(now: Date = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Whole years between two ISO dates (a birthday counts on the day itself). */
export function ageOn(dobIso: string, onIso: string): number | null {
  const dob = ISO_DATE.exec(dobIso);
  const on = ISO_DATE.exec(onIso);
  if (!dob || !on) return null;
  const [by, bm, bd] = [Number(dob[1]), Number(dob[2]), Number(dob[3])];
  const [oy, om, od] = [Number(on[1]), Number(on[2]), Number(on[3])];
  let years = oy - by;
  if (om < bm || (om === bm && od < bd)) years -= 1;
  return years;
}

export function ageBand(age: number): AgeBand {
  if (age < TEEN_MIN_AGE) return 'blocked';
  if (age < ADULT_AGE) return 'teen';
  if (age < AIAIA_MIN_AGE) return 'adult';
  return 'aiaia';
}

/** The band for a date of birth as of `onIso` (default today in IST); null for no usable date. */
export function bandForDob(dobIso: string, onIso: string = todayIst()): AgeBand | null {
  const age = ageOn(dobIso, onIso);
  if (age === null || age < 0 || age > 120) return null;
  return ageBand(age);
}

export const AGE_COPY: Record<AgeBand, string | null> = {
  blocked: 'Ask a parent or guardian to add you.',
  teen: 'Your branch will confirm a parent or guardian agrees.',
  adult: null,
  aiaia: "You'll join as an AIAIA member (parent organisation).",
};
