import { createApi, type Api } from '@aiaia/api';
import { createContext, useContext, type ReactNode } from 'react';
import { getSupabase } from '@/lib/supabase';

let defaultApi: Api | undefined;

/** Built on first use, so the app and the tests can start without Supabase env vars. */
function getDefaultApi(): Api {
  defaultApi ??= createApi(getSupabase());
  return defaultApi;
}

const ApiContext = createContext<Api | null>(null);

/** Optional: tests (and later, other clients) can supply their own API. */
export function ApiProvider({ api, children }: { api: Api; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

/**
 * The only way screens and features reach the server. They never import `@supabase/supabase-js`
 * or `@/lib/supabase` themselves.
 */
export function useApi(): Api {
  return useContext(ApiContext) ?? getDefaultApi();
}
