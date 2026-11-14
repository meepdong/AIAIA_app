import type {
  GraduateDependentResult,
  SubmitApplicationPayload,
  SubmitApplicationResult,
} from '@aiaia/shared/src/schemas/membership';
import type { Client } from '../index';

/** Friendly failure for the profile screens. `message` is safe to show as is. */
export type ProfileErrorKind =
  | 'dob_locked'
  | 'under_age'
  | 'not_pending'
  | 'invalid_input'
  | 'invalid_code'
  | 'bad_code_format'
  | 'rate_limited'
  | 'already_member'
  | 'signed_out'
  | 'offline'
  | 'unknown';

export type ProfileFailure = { ok: false; kind: ProfileErrorKind; message: string };
export type ProfileResult<T> = ({ ok: true } & T) | ProfileFailure;

export type SubmitResult = ProfileResult<SubmitApplicationResult>;
export type ClaimResult = ProfileResult<{
  memberId: string;
  status: Extract<GraduateDependentResult, { ok: true }>['status'];
  adultConsentRequired: boolean;
  guardianLinksEnded: boolean;
}>;

export const CLAIM_CODE_LENGTH = 8;
/** Claim codes use A-Z and 2-9 (no 0, O, 1 or I). Entry is case-insensitive. */
const CLAIM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;

/** Upper-cases and drops spaces and dashes, as a code is typed from a message or a printout. */
export function normalizeClaimCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}

export function isValidClaimCode(input: string): boolean {
  return CLAIM_CODE_PATTERN.test(normalizeClaimCode(input));
}

type ErrorLike = { message?: unknown; code?: unknown; status?: unknown; name?: unknown };
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const fail = (kind: ProfileErrorKind, message: string): ProfileFailure => ({
  ok: false,
  kind,
  message,
});

const OFFLINE = fail('offline', 'No internet connection. Check your connection and try again.');
const UNKNOWN = fail('unknown', 'Something went wrong. Please try again.');

function isOffline(e: ErrorLike, error: unknown): boolean {
  return (
    error instanceof TypeError ||
    e.name === 'AuthRetryableFetchError' ||
    e.status === 0 ||
    /network request failed|failed to fetch|network error|offline/i.test(str(e.message))
  );
}

/** Maps a `submit_application` error (SQLSTATE in `code`) to friendly text. */
export function mapSubmitError(error: unknown): ProfileFailure {
  const e: ErrorLike = typeof error === 'object' && error !== null ? (error as ErrorLike) : {};
  const code = str(e.code);
  const message = str(e.message);
  if (isOffline(e, error)) return OFFLINE;
  if (code === '42501') {
    if (/date of birth/i.test(message)) {
      return fail(
        'dob_locked',
        "Your date of birth can't be changed here while a parent or guardian is linked to your profile. Ask your branch officer to correct it.",
      );
    }
    return fail('signed_out', 'Please sign in again to continue.');
  }
  if (code === '23514') {
    if (/under 14/i.test(message)) {
      return fail('under_age', 'Ask a parent or guardian to add you.');
    }
    return fail(
      'not_pending',
      'Your application has already been reviewed, so it can no longer be changed here.',
    );
  }
  if (code === '22023') {
    if (/email/i.test(message)) return fail('invalid_input', 'Enter a valid email address.');
    if (/emergency_contact_phone/i.test(message)) {
      return fail('invalid_input', 'Enter the emergency contact number with 10 digits.');
    }
    if (/branch/i.test(message)) return fail('invalid_input', 'Choose your branch.');
    if (/dob/i.test(message)) return fail('invalid_input', 'Enter a valid date of birth.');
    if (/120 characters/i.test(message)) {
      return fail('invalid_input', 'One of the fields is too long (120 characters at most).');
    }
    return fail('invalid_input', 'Some details look wrong. Please check them and try again.');
  }
  return UNKNOWN;
}

/** Maps a `graduate_dependent` error to friendly text. A wrong code is `invalid_code`. */
export function mapClaimError(error: unknown): ProfileFailure {
  const e: ErrorLike = typeof error === 'object' && error !== null ? (error as ErrorLike) : {};
  const code = str(e.code);
  if (isOffline(e, error)) return OFFLINE;
  if (code === 'PT429' || e.status === 429) {
    return fail(
      'rate_limited',
      'Too many wrong codes. Please wait an hour, then check the code with your family member.',
    );
  }
  if (code === '42501') return fail('signed_out', 'Please sign in again to continue.');
  if (code === '22023' && /not valid/i.test(str(e.message))) {
    return fail('invalid_code', invalidCodeMessage());
  }
  if (code === '23514') {
    return fail(
      'already_member',
      'This login or phone number already belongs to a member, so a family code cannot be used.',
    );
  }
  return UNKNOWN;
}

function invalidCodeMessage(): string {
  return 'That code is not valid or has expired. Check it with your family member, who can make a new one.';
}

/**
 * Profile setup and the family-code claim. Methods never throw: they resolve to `{ ok: true, ... }`
 * or a friendly `{ ok: false, kind, message }`. Personal data never appears in a message.
 */
export function createProfileApi(client: Client) {
  return {
    /** Creates (or updates, while pending) the caller's application. */
    async submitApplication(payload: SubmitApplicationPayload): Promise<SubmitResult> {
      try {
        const { data, error } = await client.rpc('submit_application', {
          payload: payload as unknown as Record<string, never>,
        });
        if (error) return mapSubmitError(error);
        return { ok: true, ...(data as unknown as SubmitApplicationResult) };
      } catch (error) {
        return mapSubmitError(error);
      }
    },

    /**
     * Redeems a family code for the signed-in caller. A badly shaped code is refused here, without
     * a call, so a typo never counts as a miss against the server's rate limit.
     */
    async graduateDependent(input: string): Promise<ClaimResult> {
      if (!isValidClaimCode(input)) {
        return fail(
          'bad_code_format',
          `A family code has ${CLAIM_CODE_LENGTH} letters and numbers. Check it and try again.`,
        );
      }
      try {
        const { data, error } = await client.rpc('graduate_dependent', {
          code: normalizeClaimCode(input),
        });
        if (error) return mapClaimError(error);
        const result = data as unknown as GraduateDependentResult | null;
        if (!result || !result.ok) return fail('invalid_code', invalidCodeMessage());
        return {
          ok: true,
          memberId: result.member_id,
          status: result.status,
          adultConsentRequired: result.adult_consent_required,
          guardianLinksEnded: result.guardian_links_ended,
        };
      } catch (error) {
        return mapClaimError(error);
      }
    },

    /** The signed-in user's id from the stored session (no network), or null when signed out. */
    async userId(): Promise<string | null> {
      try {
        const { data } = await client.auth.getSession();
        return data.session?.user.id ?? null;
      } catch {
        return null;
      }
    },

    /**
     * Asks Supabase for a fresh token. That fires the session-change event, which makes the auth
     * gate read `my_profile()` again (the gate has no refresh of its own). Failure is harmless.
     */
    async refreshSession(): Promise<void> {
      try {
        await client.auth.refreshSession();
      } catch {
        // The gate catches up on the next token refresh; nothing to show the user.
      }
    },
  };
}

export type ProfileApi = ReturnType<typeof createProfileApi>;
