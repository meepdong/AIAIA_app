import type { PermissionGrant } from '@aiaia/api';
import { useQuery } from '@tanstack/react-query';
import { useAdminApi } from './AdminApiContext';
import { ADMIN_ACCESS_KEY } from './AdminShell';

/** The caller's grants, from the same cached query the shell uses. Empty until loaded. */
export function useAdminGrants(): { grants: PermissionGrant[]; ready: boolean } {
  const api = useAdminApi();
  const q = useQuery({ queryKey: ADMIN_ACCESS_KEY, queryFn: () => api.getAccess() });
  return { grants: q.data?.permissions ?? [], ready: q.data !== undefined };
}
