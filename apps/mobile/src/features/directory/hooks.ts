import { createApi } from '@aiaia/api';
import { DIRECTORY_PAGE_SIZE } from '@aiaia/shared/src/schemas/content';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

export const SEARCH_DEBOUNCE_MS = 300;

function directoryApi() {
  return createApi(getSupabase()).directory;
}

export function useDebouncedValue<T>(value: T, delayMs = SEARCH_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** Pages of `search_directory`; `q` and `branchId` are the already-debounced values. */
export function useDirectorySearch(q: string, branchId: string | null) {
  return useInfiniteQuery({
    queryKey: ['directory', 'search', q, branchId],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => directoryApi().search({ q, branch_id: branchId, page: pageParam }),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < DIRECTORY_PAGE_SIZE ? undefined : allPages.length + 1,
    placeholderData: keepPreviousData,
  });
}

export function useBranches() {
  return useQuery({
    queryKey: ['directory', 'branches'],
    queryFn: () => directoryApi().branches(),
    staleTime: 10 * 60_000,
  });
}

export async function reportMember(memberId: string, reason: string, details?: string) {
  return directoryApi().reportMember(memberId, reason, details);
}
