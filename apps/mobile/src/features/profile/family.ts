import type { MyDependentRow, MyProfileResult } from '@aiaia/shared/src/schemas/membership';
import { ADULT_AGE, TEEN_MIN_AGE, ageOn, todayIst } from './age';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Whether My family may be shown or opened: only an active member aged 18 or over. The link on
 * My profile and the screen's own guard both use this. The database enforces the same rule in
 * `add_dependent` and `my_dependents`; this keeps the screen from offering what will be refused.
 */
export function canSeeFamily(
  profile: Pick<MyProfileResult, 'member' | 'private'> | null | undefined,
  onIso: string = todayIst(),
): boolean {
  if (!profile || profile.member.status !== 'active') return false;
  const dob = profile.private?.dob;
  if (!dob) return false;
  const age = ageOn(dob, onIso);
  return age !== null && age >= ADULT_AGE;
}

/** A dependent's age in whole years today, or null when the date of birth is unknown. */
export function dependentAge(row: Pick<MyDependentRow, 'dob'>, onIso: string = todayIst()) {
  return row.dob ? ageOn(row.dob, onIso) : null;
}

/** "Give [name] their own login" is offered from age 14, to an open membership with no login. */
export function canOfferLogin(row: MyDependentRow, onIso: string = todayIst()): boolean {
  const age = dependentAge(row, onIso);
  return (
    !row.has_login &&
    age !== null &&
    age >= TEEN_MIN_AGE &&
    (row.status === 'active' || row.status === 'pending')
  );
}

/** First word of a full name, for button text. */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || 'them';
}

/** An ISO instant as `YYYY-MM-DD HH:mm` in Asia/Kolkata; empty for a missing or bad value. */
export function formatIstDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const text = new Date(ms + IST_OFFSET_MS).toISOString();
  return `${text.slice(0, 10)} ${text.slice(11, 16)}`;
}
