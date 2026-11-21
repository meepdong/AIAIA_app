import { Platform } from 'react-native';
import { LargeSecureStore } from './large-secure-store';

/**
 * The last server-confirmed `active` result, so a member who opens the app with no signal can still
 * show their pass and scan (owner decision M3, 2026-11-21). Only `active` is ever written; any other
 * confirmed state, a sign-out and a lost session delete it. Native: LargeSecureStore. Web:
 * localStorage. Every storage error reads as "no cache" (no offline access).
 */
export const OFFLINE_ACTIVE_KEY = 'aiaia.offline_active.v1';
export const OFFLINE_ACTIVE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type Cache = { userId: string; confirmedAt: number };

let nativeStore: LargeSecureStore | undefined;
const store = () =>
  Platform.OS === 'web'
    ? {
        get: async (k: string) => localStorage.getItem(k),
        set: async (k: string, v: string) => localStorage.setItem(k, v),
        remove: async (k: string) => localStorage.removeItem(k),
      }
    : (() => {
        const s = (nativeStore ??= new LargeSecureStore());
        return {
          get: (k: string) => s.getItem(k),
          set: (k: string, v: string) => s.setItem(k, v),
          remove: (k: string) => s.removeItem(k),
        };
      })();

export async function saveOfflineActive(userId: string, now = Date.now()): Promise<void> {
  try {
    await store().set(OFFLINE_ACTIVE_KEY, JSON.stringify({ userId, confirmedAt: now }));
  } catch {
    // No cache means no offline access: fails closed.
  }
}

export async function clearOfflineActive(): Promise<void> {
  try {
    await store().remove(OFFLINE_ACTIVE_KEY);
  } catch {
    // Nothing stored, or the store is unavailable.
  }
}

/** Whether `userId` was confirmed active on this device within the last 7 days. */
export function isFreshFor(cache: unknown, userId: string, now: number): boolean {
  const c = cache as Cache | null;
  if (!c || c.userId !== userId || typeof c.confirmedAt !== 'number') return false;
  const age = now - c.confirmedAt;
  return age >= 0 && age <= OFFLINE_ACTIVE_MAX_AGE_MS;
}

export async function hasOfflineActive(userId: string, now = Date.now()): Promise<boolean> {
  try {
    const raw = await store().get(OFFLINE_ACTIVE_KEY);
    return raw ? isFreshFor(JSON.parse(raw), userId, now) : false;
  } catch {
    return false;
  }
}
