import type { Session } from '@supabase/supabase-js';
import type { Client } from '../index';
import type { Database } from '@aiaia/shared';
import { mapAuthError, type AuthFailure, type AuthResult } from './errors';

export { mapAuthError, parseRetryMinutes, rateLimitMessage } from './errors';
export type { AuthErrorKind, AuthFailure, AuthResult } from './errors';

export type MemberStatus = Database['public']['Enums']['member_status'];

/** The part of `my_profile()` the auth gate needs. */
export type Membership = { status: MemberStatus; adultConsentRequired: boolean };

export type MembershipResult = { ok: true; member: Membership | null } | AuthFailure;

const MEMBER_STATUSES: readonly MemberStatus[] = [
  'pending',
  'active',
  'rejected',
  'suspended',
  'deleted',
];

/**
 * Reads `my_profile()`'s `member`. No member row (or an unreadable one) is `null`: the gate
 * treats that as "needs profile setup", never as access.
 */
export function parseMembership(profile: unknown): Membership | null {
  if (typeof profile !== 'object' || profile === null) return null;
  const member = (profile as { member?: unknown }).member;
  if (typeof member !== 'object' || member === null) return null;
  const { status, adult_consent_required: consent } = member as Record<string, unknown>;
  const known = MEMBER_STATUSES.find((s) => s === status);
  if (!known) return null;
  return { status: known, adultConsentRequired: consent === true };
}

/**
 * The user id of the session saved on this device, read without the network. supabase-js keeps a
 * session it could not refresh for a network reason, but reports it as `null` (INITIAL_SESSION);
 * a rejected refresh token or a sign-out removes it (and emits SIGNED_OUT). So a non-null answer
 * here with a null session means "offline", not "signed out". Any surprise reads as no session.
 */
export async function storedSessionUserId(client: Client): Promise<string | null> {
  try {
    const internal = client.auth as unknown as {
      storage?: { getItem(key: string): string | null | Promise<string | null> };
      storageKey?: string;
    };
    if (!internal.storage || !internal.storageKey) return null;
    const raw = await internal.storage.getItem(internal.storageKey);
    const saved: unknown = raw ? JSON.parse(raw) : null;
    const s = saved as { refresh_token?: unknown; user?: { id?: unknown } } | null;
    return s && typeof s.refresh_token === 'string' && typeof s.user?.id === 'string'
      ? s.user.id
      : null;
  } catch {
    return null;
  }
}

export type SignOutOptions = {
  /** This device's push token. Its `push_tokens` row is removed so the next user gets no alerts. */
  pushToken?: string | null;
};

/**
 * Every auth call in the app goes through here, so a future provider switch touches one place.
 * Methods never throw: they resolve to `{ ok: true }` or a friendly `{ ok: false, message }`.
 * `phone` is E.164, e.g. `+919000000001`.
 */
export function createAuthApi(client: Client) {
  return {
    async requestCode(phone: string): Promise<AuthResult> {
      try {
        const { error } = await client.auth.signInWithOtp({ phone });
        return error ? mapAuthError(error) : { ok: true };
      } catch (error) {
        return mapAuthError(error);
      }
    },

    async verifyCode(phone: string, token: string): Promise<AuthResult> {
      try {
        const { error } = await client.auth.verifyOtp({ phone, token, type: 'sms' });
        return error ? mapAuthError(error) : { ok: true };
      } catch (error) {
        return mapAuthError(error);
      }
    },

    /**
     * Removes this device's own push token (RLS allows own-row delete), then ends THIS device's
     * session only. Other devices stay signed in; "sign out everywhere" is a separate action.
     * A failed token delete never blocks signing out.
     */
    async signOut(options: SignOutOptions = {}): Promise<AuthResult> {
      if (options.pushToken) {
        try {
          await client.from('push_tokens').delete().eq('token', options.pushToken);
        } catch {
          // Best effort: a stale token row is harmless, a stuck sign-out is not.
        }
      }
      try {
        const { error } = await client.auth.signOut({ scope: 'local' });
        return error ? mapAuthError(error) : { ok: true };
      } catch (error) {
        return mapAuthError(error);
      }
    },

    /** Who is this session? `member: null` means signed in but no member row yet. */
    async loadMembership(): Promise<MembershipResult> {
      try {
        const { data, error } = await client.rpc('my_profile');
        if (error) return mapAuthError(error);
        return { ok: true, member: parseMembership(data) };
      } catch (error) {
        return mapAuthError(error);
      }
    },

    /** The saved session's user id without the network (see storedSessionUserId). */
    storedUserId(): Promise<string | null> {
      return storedSessionUserId(client);
    },

    /** Native only: keep the token fresh while the app is in the foreground. */
    startAutoRefresh(): Promise<void> {
      return client.auth.startAutoRefresh();
    },
    stopAutoRefresh(): Promise<void> {
      return client.auth.stopAutoRefresh();
    },

    /** Subscribes to session changes (including the initial one). Returns the unsubscribe. */
    onSession(cb: (session: Session | null, event: string) => void): () => void {
      const { data } = client.auth.onAuthStateChange((event, session) => cb(session, event));
      return () => data.subscription.unsubscribe();
    },
  };
}

export type AuthApi = ReturnType<typeof createAuthApi>;
