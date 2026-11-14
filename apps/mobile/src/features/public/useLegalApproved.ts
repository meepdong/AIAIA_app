import { useQuery } from '@tanstack/react-query';
import type { Api } from '@aiaia/api';
import { getDefaultApi, useApi } from '@/features/auth/useApi';

/**
 * True only when `app_settings.legal_approved` is exactly `true`. A missing row, a null, an error
 * or missing env vars all mean "not approved", so the DRAFT banner stays up.
 */
export async function fetchLegalApproved(api?: Api): Promise<boolean> {
  try {
    const result = await (api ?? getDefaultApi()).settings.getSetting('legal_approved');
    return result.ok && result.value === true;
  } catch {
    return false;
  }
}

export function useLegalApproved(): boolean {
  const api = useApi();
  const query = useQuery({
    queryKey: ['public', 'legal_approved'],
    queryFn: () => fetchLegalApproved(api),
    retry: false,
  });
  return query.data === true;
}
