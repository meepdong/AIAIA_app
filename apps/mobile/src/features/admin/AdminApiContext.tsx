import type { AdminApi } from '@aiaia/api';
import { createContext, useContext, type ReactNode } from 'react';
import { useApi } from '@/features/auth/useApi';

const AdminApiContext = createContext<AdminApi | null>(null);

/** Tests (and later briefs) can supply their own api; the app falls back to the shared API. */
export function AdminApiProvider({ api, children }: { api: AdminApi; children: ReactNode }) {
  return <AdminApiContext.Provider value={api}>{children}</AdminApiContext.Provider>;
}

export function useAdminApi(): AdminApi {
  const injected = useContext(AdminApiContext);
  const shared = useApi();
  return injected ?? shared.admin;
}
