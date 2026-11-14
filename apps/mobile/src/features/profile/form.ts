import type {
  MyProfileResult,
  PrivacyFlags,
  SubmitApplicationPayload,
} from '@aiaia/shared/src/schemas/membership';
import { bandForDob, type AgeBand } from './age';

export const STEPS = ['About you', 'Contact & work', 'Photo', 'Consents'] as const;
export const LAST_STEP = STEPS.length - 1;

export type PrivacyKey = keyof Required<PrivacyFlags>;

/** Everything the form holds. Text fields are raw input; `toPayload` trims and drops blanks. */
export interface ProfileDraft {
  step: number;
  fullName: string;
  branchId: string;
  /** ISO date, or '' while incomplete. */
  dob: string;
  gender: string;
  city: string;
  occupation: string;
  education: string;
  emergencyName: string;
  /** The 10-digit national number; +91 is added when sending. */
  emergencyPhone: string;
  email: string;
  whatsappOptIn: boolean;
  emailUpdatesOptIn: boolean;
  privacy: Record<PrivacyKey, boolean>;
}

/** Opt-in by default for nothing: phone and email hidden, the rest shown (as the database does). */
export const DEFAULT_PRIVACY: Record<PrivacyKey, boolean> = {
  show_phone: false,
  show_email: false,
  show_city: true,
  show_occupation: true,
  show_photo: true,
};

export function emptyDraft(): ProfileDraft {
  return {
    step: 0,
    fullName: '',
    branchId: '',
    dob: '',
    gender: '',
    city: '',
    occupation: '',
    education: '',
    emergencyName: '',
    emergencyPhone: '',
    email: '',
    whatsappOptIn: false,
    emailUpdatesOptIn: false,
    privacy: { ...DEFAULT_PRIVACY },
  };
}

export type FieldErrors = Partial<Record<keyof ProfileDraft, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164 = /^\+[1-9]\d{7,14}$/;
const MAX_TEXT = 120;

/** The stored form of the emergency number: a full +E.164 number is kept, 10 digits get +91. */
export const toE164 = (phone: string) => (phone.startsWith('+') ? phone : `+91${phone}`);
const tooLong = (value: string) => value.trim().length > MAX_TEXT;

/** The age band for the draft's DOB today in IST, or null while the DOB is incomplete. */
export function bandOf(draft: Pick<ProfileDraft, 'dob'>, onIso?: string): AgeBand | null {
  return draft.dob ? bandForDob(draft.dob, onIso) : null;
}

/** Errors for the fields shown on one step. Empty means the step may be left. */
export function validateStep(step: number, draft: ProfileDraft, onIso?: string): FieldErrors {
  const errors: FieldErrors = {};
  if (step === 0) {
    if (!draft.fullName.trim()) errors.fullName = 'Enter your name.';
    else if (tooLong(draft.fullName)) errors.fullName = 'Your name is too long.';
    if (!draft.branchId) errors.branchId = 'Choose your branch.';
    if (!draft.dob) {
      errors.dob = 'Enter your date of birth.';
    } else if (bandOf(draft, onIso) === null) {
      errors.dob = 'Enter a valid date of birth.';
    } else if (bandOf(draft, onIso) === 'blocked') {
      errors.dob = 'Ask a parent or guardian to add you.';
    }
    if (tooLong(draft.gender)) errors.gender = 'Too long.';
  }
  if (step === 1) {
    if (draft.email.trim() && !EMAIL.test(draft.email.trim())) {
      errors.email = 'Enter a valid email address, or leave it blank.';
    }
    const hasName = draft.emergencyName.trim().length > 0;
    const hasPhone = draft.emergencyPhone.length > 0;
    if (hasPhone && !/^\d{10}$/.test(draft.emergencyPhone) && !E164.test(draft.emergencyPhone)) {
      errors.emergencyPhone = 'Enter a valid 10-digit mobile number.';
    }
    if (hasName && !hasPhone) errors.emergencyPhone = 'Add a number for this contact.';
    if (hasPhone && !hasName) errors.emergencyName = 'Add a name for this contact.';
    for (const key of ['city', 'occupation', 'education', 'emergencyName'] as const) {
      if (tooLong(draft[key])) errors[key] = 'Too long (120 characters at most).';
    }
  }
  return errors;
}

/** First step with an error, so a submit can jump back to it; null when the draft is complete. */
export function firstInvalidStep(draft: ProfileDraft, onIso?: string): number | null {
  for (let step = 0; step <= LAST_STEP; step += 1) {
    if (Object.keys(validateStep(step, draft, onIso)).length > 0) return step;
  }
  return null;
}

const blankToNull = (value: string) => (value.trim() ? value.trim() : null);

/** The `submit_application` payload. Opt-ins and privacy are always sent explicitly. */
export function toPayload(draft: ProfileDraft): SubmitApplicationPayload {
  return {
    full_name: draft.fullName.trim(),
    dob: draft.dob,
    branch_id: draft.branchId,
    gender: blankToNull(draft.gender),
    city: blankToNull(draft.city),
    occupation: blankToNull(draft.occupation),
    education: blankToNull(draft.education),
    email: blankToNull(draft.email),
    emergency_contact_name: blankToNull(draft.emergencyName),
    emergency_contact_phone: draft.emergencyPhone ? toE164(draft.emergencyPhone) : null,
    whatsapp_opt_in: draft.whatsappOptIn,
    email_updates_opt_in: draft.emailUpdatesOptIn,
    privacy: { ...draft.privacy },
  };
}

const TEXT_KEYS = [
  'fullName',
  'branchId',
  'dob',
  'gender',
  'city',
  'occupation',
  'education',
  'emergencyName',
  'emergencyPhone',
  'email',
] as const;

/**
 * Reads a stored draft back. Anything missing or of the wrong type falls back to the empty value,
 * so a draft saved by an older version of the form can never break the screen.
 */
export function parseDraft(raw: string): ProfileDraft | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const source = data as Record<string, unknown>;
  const draft = emptyDraft();
  for (const key of TEXT_KEYS) {
    const value = source[key];
    if (typeof value === 'string') draft[key] = value;
  }
  if (typeof source.step === 'number' && Number.isInteger(source.step)) {
    draft.step = Math.min(Math.max(source.step, 0), LAST_STEP);
  }
  if (typeof source.whatsappOptIn === 'boolean') draft.whatsappOptIn = source.whatsappOptIn;
  if (typeof source.emailUpdatesOptIn === 'boolean') {
    draft.emailUpdatesOptIn = source.emailUpdatesOptIn;
  }
  const privacy = source.privacy;
  if (typeof privacy === 'object' && privacy !== null) {
    for (const key of Object.keys(DEFAULT_PRIVACY) as PrivacyKey[]) {
      const value = (privacy as Record<string, unknown>)[key];
      if (typeof value === 'boolean') draft.privacy[key] = value;
    }
  }
  return draft;
}

const asText = (v: unknown) => (typeof v === 'string' ? v : '');

/** Builds a draft from `my_profile()` so a pending applicant can edit what they submitted. */
export function draftFromProfile(profile: MyProfileResult): ProfileDraft {
  const { member, private: priv } = profile;
  const draft = emptyDraft();
  draft.fullName = member.full_name;
  draft.branchId = member.branch_id;
  draft.dob = priv?.dob ?? '';
  draft.gender = asText(member.gender);
  draft.city = asText(member.city);
  draft.occupation = asText(member.occupation);
  draft.education = asText(member.education);
  draft.emergencyName = asText(priv?.emergency_contact_name);
  const storedPhone = asText(priv?.emergency_contact_phone);
  // Only an Indian number is shown as its 10 national digits; any other keeps its full +E.164.
  draft.emergencyPhone = /^\+91\d{10}$/.test(storedPhone) ? storedPhone.slice(3) : storedPhone;
  draft.email = asText(priv?.email);
  const prefs = (priv?.notify_prefs ?? {}) as Record<string, unknown>;
  draft.whatsappOptIn = prefs.whatsapp === true;
  draft.emailUpdatesOptIn = prefs.email_updates === true;
  const privacy = (member.privacy ?? {}) as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_PRIVACY) as PrivacyKey[]) {
    if (typeof privacy[key] === 'boolean') draft.privacy[key] = privacy[key] as boolean;
  }
  return draft;
}
