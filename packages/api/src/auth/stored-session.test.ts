import { createClient } from '@supabase/supabase-js';
import type { Client } from '../index';
import { storedSessionUserId } from './index';

// Against a real supabase-js client, so an upgrade that moves the saved session is caught here.
function clientWith(saved: Record<string, string>) {
  const storage = {
    getItem: async (k: string) => saved[k] ?? null,
    setItem: async (k: string, v: string) => void (saved[k] = v),
    removeItem: async (k: string) => void delete saved[k],
  };
  return createClient('http://127.0.0.1:1', 'anon-key', {
    auth: {
      storage,
      storageKey: 'sb-test-auth-token',
      autoRefreshToken: false,
      persistSession: true,
    },
  }) as unknown as Client;
}

describe('storedSessionUserId', () => {
  it('reads the saved session user id without the network', async () => {
    const saved = {
      'sb-test-auth-token': JSON.stringify({
        access_token: 'a',
        refresh_token: 'r',
        expires_at: 1,
        user: { id: 'user-1' },
      }),
    };
    await expect(storedSessionUserId(clientWith(saved))).resolves.toBe('user-1');
  });

  it('is null with no saved session, or one without a refresh token', async () => {
    await expect(storedSessionUserId(clientWith({}))).resolves.toBeNull();
    const noRefresh = { 'sb-test-auth-token': JSON.stringify({ user: { id: 'user-1' } }) };
    await expect(storedSessionUserId(clientWith(noRefresh))).resolves.toBeNull();
  });
});
