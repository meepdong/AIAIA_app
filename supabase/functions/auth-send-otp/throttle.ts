// Postgres-backed ThrottleStore over public.otp_throttle (service role only).
// The check and the insert happen atomically in public.otp_throttle_take, so parallel sends for
// one number cannot all slip under the limit.
import type { ThrottleStore, ThrottleTake } from './handler.ts';

// The slice of supabase-js this store uses, typed structurally so no npm import is needed here.
export interface ThrottleTableClient {
  rpc(
    fn: 'otp_throttle_take',
    args: { p_hash: string },
  ): PromiseLike<{ data: unknown; error: unknown }>;
  from(table: 'otp_throttle'): {
    delete(): { lt(column: string, value: string): PromiseLike<{ error: unknown }> };
  };
}

function parseTake(data: unknown): ThrottleTake {
  const result = data as { allowed?: unknown; retry_at?: unknown } | null;
  if (result?.allowed === true) return { allowed: true };
  if (result?.allowed === false && typeof result.retry_at === 'string') {
    const retryAt = new Date(result.retry_at);
    if (!Number.isNaN(retryAt.getTime())) return { allowed: false, retryAt };
  }
  throw new Error('otp_throttle_take returned an unexpected result');
}

export function createPostgresThrottleStore(client: ThrottleTableClient): ThrottleStore {
  return {
    async take(phoneHash) {
      const { data, error } = await client.rpc('otp_throttle_take', { p_hash: phoneHash });
      if (error) throw new Error('otp_throttle_take failed');
      return parseTake(data);
    },
    async purgeOlderThan(cutoff) {
      const { error } = await client
        .from('otp_throttle')
        .delete()
        .lt('sent_at', cutoff.toISOString());
      if (error) throw new Error('otp_throttle purge failed');
    },
  };
}
