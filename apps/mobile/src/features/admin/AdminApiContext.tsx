import { createAdminApi, type AdminApi } from '@aiaia/api';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { getSupabase } from '@/lib/supabase';

const AdminApiContext = createContext<AdminApi | null>(null);

/** Tests (and later briefs) can supply their own api; the app falls back to the real client. */
export function AdminApiProvider({ api, children }: { api: AdminApi; children: ReactNode }) {
  return <AdminApiContext.Provider value={api}>{children}</AdminApiContext.Provider>;
}

export function useAdminApi(): AdminApi {
  const injected = useContext(AdminApiContext);
  return useMemo(() => injected ?? createAdminApi(getSupabase()), [injected]);
}
