import type { Api } from '@aiaia/api';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { clearPassCache } from '@/features/checkin/pass-cache';
import { clearScanData } from '@/features/checkin/scan-store';
import { clearOfflineActive } from '@/lib/offline-access';
import { getPushToken } from './push-token';
import { useApi } from './useApi';

/**
 * Signs this device out: removes its push token, ends the session, then empties the React Query
 * cache so the next person on this device never sees the last one's data. The cache and the saved
 * delegate passes are cleared even when sign-out reports a failure, because the data must not outlive the attempt.
 */
export function useSignOut(): () => Promise<Awaited<ReturnType<Api['auth']['signOut']>>> {
  const { auth, checkin } = useApi();
  const queryClient = useQueryClient();
  return useCallback(async () => {
    // The user id comes from the local session, so read it before the session is gone.
    const userId = await checkin?.cacheOwner().catch(() => null);
    const result = await auth.signOut({ pushToken: getPushToken() });
    queryClient.clear();
    // Offline access (owner decision M3) must not outlive a sign-out press, even one made offline,
    // where SIGNED_OUT (which also clears it, in session.tsx) may not be what the app sees first.
    await clearOfflineActive();
    // The saved delegate passes belong to this person, not to the next one on this device.
    if (userId) {
      await clearPassCache(userId);
      await clearScanData(userId);
    }
    return result;
  }, [auth, checkin, queryClient]);
}
