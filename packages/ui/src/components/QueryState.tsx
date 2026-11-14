import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTheme } from '../theme';
import { EmptyState } from './EmptyState';

/** The slice of a React Query result that QueryState reads. Any `useQuery` result satisfies it. */
export type QueryLike<TData> = {
  data: TData | undefined;
  isPending: boolean;
  isError: boolean;
  error?: unknown;
  fetchStatus?: 'fetching' | 'paused' | 'idle';
  refetch?: () => unknown;
};

export type QueryStateProps<TData> = {
  query: QueryLike<TData>;
  /** Defaults to: arrays are empty when length is 0, null/undefined are empty. */
  isEmpty?: (data: TData) => boolean;
  emptyTitle?: string;
  emptyMessage?: string;
  /** What to show when the data is there. */
  children: (data: TData) => ReactNode;
};

export type QueryStatus = 'loading' | 'offline' | 'error' | 'empty' | 'ready';

function defaultIsEmpty(data: unknown): boolean {
  return data == null || (Array.isArray(data) && data.length === 0);
}

export function queryStatus<TData>(
  query: QueryLike<TData>,
  isEmpty: (data: TData) => boolean = defaultIsEmpty,
): QueryStatus {
  // React Query pauses a request while offline; with nothing cached that is the offline state.
  if (query.fetchStatus === 'paused' && query.data === undefined) return 'offline';
  // An idle query with no data (e.g. disabled) is empty, not loading.
  if (query.isPending && query.fetchStatus !== 'idle') return 'loading';
  if (query.isError && query.data === undefined) return 'error';
  if (query.data === undefined || isEmpty(query.data)) return 'empty';
  return 'ready';
}

/** Wraps a React Query result and renders loading / error / empty / offline for it. */
export function QueryState<TData>({
  query,
  isEmpty,
  emptyTitle = 'Nothing here yet',
  emptyMessage,
  children,
}: QueryStateProps<TData>) {
  const { colors, tokens } = useTheme();
  const status = queryStatus(query, isEmpty);
  const retry = query.refetch
    ? { label: 'Try again', onPress: () => void query.refetch?.() }
    : undefined;

  switch (status) {
    case 'loading':
      return (
        <View
          accessibilityRole="progressbar"
          accessibilityLabel="Loading"
          style={{ alignItems: 'center', padding: tokens.spacing[6] }}
        >
          <ActivityIndicator color={colors.text} />
        </View>
      );
    case 'offline':
      return (
        <EmptyState
          title="You are offline"
          message="Check your connection. We will load this when you are back online."
          action={retry}
        />
      );
    case 'error':
      return (
        <EmptyState
          title="Something went wrong"
          message="We could not load this. Please try again."
          action={retry}
        />
      );
    case 'empty':
      return <EmptyState title={emptyTitle} message={emptyMessage} />;
    case 'ready':
      return <>{children(query.data as TData)}</>;
  }
}
