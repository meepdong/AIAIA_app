// Postgres-backed ThrottleStore over public.otp_throttle (service role only).
import type { ThrottleStore } from './handler.ts';

// The slice of supabase-js this store uses, typed structurally so no npm import is needed here.
export interface ThrottleTableClient {
  from(table: 'otp_throttle'): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        gt(
          column: string,
          value: string,
        ): {
          order(
            column: string,
            options: { ascending: boolean },
          ): PromiseLike<{ data: { sent_at: string }[] | null; error: unknown }>;
        };
      };
    };
    insert(row: { phone_hash: string; sent_at: string }): PromiseLike<{ error: unknown }>;
    delete(): { lt(column: string, value: string): PromiseLike<{ error: unknown }> };
  };
}

export function createPostgresThrottleStore(client: ThrottleTableClient): ThrottleStore {
  return {
    async sentSince(phoneHash, since) {
      const { data, error } = await client
        .from('otp_throttle')
        .select('sent_at')
        .eq('phone_hash', phoneHash)
        .gt('sent_at', since.toISOString())
        .order('sent_at', { ascending: true });
      if (error) throw new Error('otp_throttle read failed');
      return (data ?? []).map((row) => new Date(row.sent_at));
    },
    async record(phoneHash, at) {
      const { error } = await client
        .from('otp_throttle')
        .insert({ phone_hash: phoneHash, sent_at: at.toISOString() });
      if (error) throw new Error('otp_throttle write failed');
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
