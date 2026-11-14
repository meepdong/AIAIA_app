/**
 * This device's push token, if it has one. P1-06 (push registration) calls `setPushToken` once it
 * has registered; sign-out reads it so the token's `push_tokens` row goes with the session.
 * Device-only state: it is never persisted here.
 */
let current: string | undefined;

export function setPushToken(token: string | null | undefined): void {
  current = token || undefined;
}

export function getPushToken(): string | undefined {
  return current;
}
