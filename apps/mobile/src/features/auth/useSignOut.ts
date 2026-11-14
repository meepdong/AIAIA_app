import type { Api } from '@aiaia/api';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { getPushToken } from './push-token';
import { useApi } from './useApi';

/**
 * Signs this device out: removes its push token, ends the session, then empties the React Query
 * cache so the next person on this device never sees the last one's data. The cache is cleared
 * even when sign-out reports a failure, because the data must not outlive the attempt.
 */
export function useSignOut(): () => Promise<Awaited<ReturnType<Api['auth']['signOut']>>> {
  const { auth } = useApi();
  const queryClient = useQueryClient();
  return useCallback(async () => {
    const result = await auth.signOut({ pushToken: getPushToken() });
    queryClient.clear();
    return result;
  }, [auth, queryClient]);
}
