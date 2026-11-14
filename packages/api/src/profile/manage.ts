import type {
  GiveAdultConsentPayload,
  GiveAdultConsentResult,
  MyProfileResult,
} from '@aiaia/shared/src/schemas/membership';
import type { Client } from '../index';

/** Friendly failure; `message` is safe to show as is. */
export type ManageFailure = {
  ok: false;
  kind: 'offline' | 'not_due' | 'signed_out' | 'unknown';
  message: string;
};

export type InfoRequest = { id: string; message: string; createdAt: string };

type ErrorLike = { message?: unknown; code?: unknown; status?: unknown };

function mapManageError(error: unknown): ManageFailure {
  const e: ErrorLike = typeof error === 'object' && error !== null ? (error as ErrorLike) : {};
  const text = typeof e.message === 'string' ? e.message : '';
  if (
    error instanceof TypeError ||
    e.status === 0 ||
    /network request failed|failed to fetch|network error|offline/i.test(text)
  ) {
    return {
      ok: false,
      kind: 'offline',
      message: 'No internet connection. Check your connection and try again.',
    };
  }
  if (e.code === '42501') {
    return { ok: false, kind: 'signed_out', message: 'Please sign in again to continue.' };
  }
  if (e.code === '23514') {
    return {
      ok: false,
      kind: 'not_due',
      message: 'Nothing is waiting for your consent. Reopen the app to continue.',
    };
  }
  return { ok: false, kind: 'unknown', message: 'Something went wrong. Please try again.' };
}

/** Reads of the caller's own profile and the 18th-birthday consent. Methods never throw. */
export function createManageMethods(client: Client) {
  return {
    /** `my_profile()`; `profile: null` when the caller has no member row. */
    async myProfile(): Promise<{ ok: true; profile: MyProfileResult | null } | ManageFailure> {
      try {
        const { data, error } = await client.rpc('my_profile');
        if (error) return mapManageError(error);
        const profile = data as unknown as MyProfileResult | null;
        return { ok: true, profile: profile && profile.member ? profile : null };
      } catch (error) {
        return mapManageError(error);
      }
    },

    /** "Request info" messages from approvers (own notifications), newest first. */
    async infoRequests(): Promise<{ ok: true; items: InfoRequest[] } | ManageFailure> {
      try {
        const { data, error } = await client
          .from('notifications')
          .select('id, data, created_at')
          .eq('kind', 'membership.info_requested')
          .order('created_at', { ascending: false })
          .limit(10);
        if (error) return mapManageError(error);
        const items: InfoRequest[] = [];
        for (const row of data ?? []) {
          const d = row.data as { message?: unknown } | null;
          if (d && typeof d.message === 'string') {
            items.push({ id: row.id, message: d.message, createdAt: row.created_at });
          }
        }
        return { ok: true, items };
      } catch (error) {
        return mapManageError(error);
      }
    },

    /** `give_adult_consent`: accepts the account as the member's own. */
    async giveAdultConsent(
      payload: GiveAdultConsentPayload,
    ): Promise<({ ok: true } & GiveAdultConsentResult) | ManageFailure> {
      try {
        const { data, error } = await client.rpc('give_adult_consent', {
          payload: payload as unknown as Record<string, never>,
        });
        if (error) return mapManageError(error);
        return { ok: true, ...(data as unknown as GiveAdultConsentResult) };
      } catch (error) {
        return mapManageError(error);
      }
    },
  };
}
