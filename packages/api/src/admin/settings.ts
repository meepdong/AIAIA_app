import type { Database, Json } from '@aiaia/shared';
import type { Client } from '../index';

export type SettingRow = Database['public']['Functions']['admin_list_settings']['Returns'][number];

export function createSettingsApi(client: Client) {
  return {
    /** Secret values come back null from the database; `is_secret` says why. */
    async listSettings(): Promise<SettingRow[]> {
      const res = await client.rpc('admin_list_settings');
      if (res.error) throw res.error;
      return res.data ?? [];
    },

    /** `value` is sent as JSON as given: a boolean stays a boolean. */
    async setSetting(key: string, value: Json): Promise<void> {
      const res = await client.rpc('admin_set_setting', { key, value });
      if (res.error) throw res.error;
    },
  };
}
