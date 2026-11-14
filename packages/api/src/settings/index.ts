import type { Json } from '@aiaia/shared';
import type { Client } from '../index';

export type SettingResult = { ok: true; value: Json | null } | { ok: false };

/**
 * Reads `app_settings` rows that RLS lets the caller see (public ones, signed out or in).
 * Never throws: a missing row is `{ ok: true, value: null }`; an error or a thrown request is
 * `{ ok: false }`.
 */
export function createSettingsApi(client: Client) {
  return {
    async getSetting(key: string): Promise<SettingResult> {
      try {
        const { data, error } = await client
          .from('app_settings')
          .select('value')
          .eq('key', key)
          .maybeSingle();
        if (error) return { ok: false };
        return { ok: true, value: data?.value ?? null };
      } catch {
        return { ok: false };
      }
    },
  };
}

export type SettingsApi = ReturnType<typeof createSettingsApi>;
