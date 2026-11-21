import type { Api } from '@aiaia/api';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { useApiGetter } from './useApi';

/**
 * Native only. Supabase refreshes the token on a timer, which the OS pauses in the background, so
 * the timer runs only while the app is in the foreground and restarts on return. The web client
 * handles visibility itself.
 */
export function useAutoRefreshOnForeground(): void {
  const getApi = useApiGetter();
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let auth: Api['auth'];
    try {
      auth = getApi().auth;
    } catch {
      return; // no Supabase config: nothing to refresh
    }
    const sync = (state: string | null | undefined) => {
      void (state === 'active' ? auth.startAutoRefresh() : auth.stopAutoRefresh());
    };
    sync(AppState.currentState);
    const subscription = AppState.addEventListener('change', sync);
    return () => {
      subscription.remove();
      void auth.stopAutoRefresh();
    };
  }, [getApi]);
}
