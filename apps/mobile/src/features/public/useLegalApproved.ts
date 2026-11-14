import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';

type SettingResult = { data: { value: unknown } | null; error: unknown };
// `app_settings` is added by P1-00a and is not in the generated types yet.
type SettingsClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => { maybeSingle: () => PromiseLike<SettingResult> };
    };
  };
};

/**
 * True only when `app_settings.legal_approved` is exactly `true`. A missing row, a null, an error,
 * a missing table or missing env vars all mean "not approved", so the DRAFT banner stays up.
 */
export async function fetchLegalApproved(): Promise<boolean> {
  try {
    const client = getSupabase() as unknown as SettingsClient;
    const { data, error } = await client
      .from('app_settings')
      .select('value')
      .eq('key', 'legal_approved')
      .maybeSingle();
    return !error && data?.value === true;
  } catch {
    return false;
  }
}

export function useLegalApproved(): boolean {
  const query = useQuery({
    queryKey: ['public', 'legal_approved'],
    queryFn: fetchLegalApproved,
    retry: false,
  });
  return query.data === true;
}
