import type { MemberPass } from '@aiaia/api';
import { Platform } from 'react-native';
import { LargeSecureStore } from '@/lib/large-secure-store';

/**
 * The last passes fetched for a user, kept so the pass screen works offline. Native: the encrypted
 * LargeSecureStore (key in expo-secure-store). Web: localStorage. Cleared on sign-out.
 * Every storage call is guarded: a blocked or empty store just means "no cache".
 */
export type PassCache = { savedAt: string; passes: MemberPass[] };

export const passCacheKey = (userId: string) => `aiaia.passes.v1.${userId}`;

type Store = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};

let nativeStore: LargeSecureStore | undefined;

async function store(): Promise<Store> {
  if (Platform.OS === 'web') {
    return {
      get: async (k) => localStorage.getItem(k),
      set: async (k, v) => localStorage.setItem(k, v),
      remove: async (k) => localStorage.removeItem(k),
    };
  }
  nativeStore ??= new LargeSecureStore();
  const s = nativeStore;
  return {
    get: (k) => s.getItem(k),
    set: (k, v) => s.setItem(k, v),
    remove: (k) => s.removeItem(k),
  };
}

function isCache(x: unknown): x is PassCache {
  const c = x as PassCache;
  return !!c && typeof c.savedAt === 'string' && Array.isArray(c.passes);
}

export async function loadPassCache(userId: string): Promise<PassCache | null> {
  try {
    const raw = await (await store()).get(passCacheKey(userId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isCache(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function savePassCache(userId: string, passes: MemberPass[]): Promise<void> {
  try {
    const value: PassCache = { savedAt: new Date().toISOString(), passes };
    await (await store()).set(passCacheKey(userId), JSON.stringify(value));
  } catch {
    // Caching is a convenience; the screen still shows the fresh passes.
  }
}

export async function clearPassCache(userId: string): Promise<void> {
  try {
    await (await store()).remove(passCacheKey(userId));
  } catch {
    // Nothing to clear, or the store is unavailable.
  }
}
