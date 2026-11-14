import type { Session } from '@supabase/supabase-js';
import type { Client } from '../index';
import { mapAuthError, type AuthResult } from './errors';

export { mapAuthError, parseRetryMinutes, rateLimitMessage } from './errors';
export type { AuthErrorKind, AuthFailure, AuthResult } from './errors';

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

    /** Subscribes to session changes (including the initial one). Returns the unsubscribe. */
    onSession(cb: (session: Session | null, event: string) => void): () => void {
      const { data } = client.auth.onAuthStateChange((event, session) => cb(session, event));
      return () => data.subscription.unsubscribe();
    },
  };
}

export type AuthApi = ReturnType<typeof createAuthApi>;
