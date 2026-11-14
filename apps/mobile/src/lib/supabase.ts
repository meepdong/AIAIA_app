import { createClient } from '@supabase/supabase-js';
import type { Database } from '@aiaia/shared';
import { Platform } from 'react-native';
import { LargeSecureStore } from './large-secure-store';

const isWeb = Platform.OS === 'web';

let client: ReturnType<typeof createSupabase> | undefined;

function createSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      'Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (see .env.example).',
    );
  }
  return createClient<Database>(url, key, {
    auth: {
      // Web: the library's default localStorage. Native: encrypted LargeSecureStore.
      ...(isWeb ? {} : { storage: new LargeSecureStore() }),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: isWeb,
    },
  });
}

/** Lazily created so the app can start (and tests can import) without env vars set. */
export function getSupabase() {
  client ??= createSupabase();
  return client;
}
