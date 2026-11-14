/** Friendly, user-facing auth errors. The OTP is never part of any message. */
export type AuthErrorKind = 'wrong_code' | 'expired_code' | 'rate_limited' | 'offline' | 'unknown';

export type AuthFailure = {
  ok: false;
  kind: AuthErrorKind;
  message: string;
  /** Set for `rate_limited` when the server said how long to wait. */
  retryAfterMinutes?: number;
};

export type AuthResult = { ok: true } | AuthFailure;

type ErrorLike = { name?: unknown; message?: unknown; status?: unknown; code?: unknown };

function asErrorLike(error: unknown): ErrorLike {
  return typeof error === 'object' && error !== null ? (error as ErrorLike) : {};
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** "Try again in 7 minutes." -> 7. Returns undefined when the text carries no number. */
export function parseRetryMinutes(message: string): number | undefined {
  const match = /(\d+)\s*min/i.exec(message);
  if (!match) return undefined;
  const minutes = Number(match[1]);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : undefined;
}

export function rateLimitMessage(minutes?: number): string {
  if (minutes === undefined) return 'Too many attempts. Please wait a few minutes and try again.';
  return `Too many codes requested. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;
}

/** Maps a Supabase auth error (or a thrown network error) to friendly text. */
export function mapAuthError(error: unknown): AuthFailure {
  const e = asErrorLike(error);
  const message = str(e.message);
  const code = str(e.code);
  const name = str(e.name);
  const status = typeof e.status === 'number' ? e.status : undefined;

  if (status === 429 || /rate_limit/.test(code) || /too many/i.test(message)) {
    const retryAfterMinutes = parseRetryMinutes(message);
    return {
      ok: false,
      kind: 'rate_limited',
      message: rateLimitMessage(retryAfterMinutes),
      ...(retryAfterMinutes !== undefined ? { retryAfterMinutes } : {}),
    };
  }

  if (
    name === 'AuthRetryableFetchError' ||
    error instanceof TypeError ||
    status === 0 ||
    /network request failed|failed to fetch|network error|offline/i.test(message)
  ) {
    return {
      ok: false,
      kind: 'offline',
      message: 'No internet connection. Check your connection and try again.',
    };
  }

  // Supabase answers "Token has expired or is invalid" for a wrong AND an expired code, so only a
  // message that says "expired" without "invalid" is reported as a pure expiry.
  const expiredOnly = /expired/i.test(message) && !/invalid/i.test(message);
  if (expiredOnly) {
    return {
      ok: false,
      kind: 'expired_code',
      message: 'That code has expired. Ask for a new code.',
    };
  }
  if (code === 'otp_expired' || code === 'validation_failed' || /invalid|token/i.test(message)) {
    return {
      ok: false,
      kind: 'wrong_code',
      message: 'That code is incorrect or has expired. Check the digits, or ask for a new code.',
    };
  }

  return {
    ok: false,
    kind: 'unknown',
    message: 'Something went wrong. Please try again.',
  };
}
