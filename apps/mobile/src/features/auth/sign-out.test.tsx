import type { Api } from '@aiaia/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { OFFLINE_ACTIVE_KEY, hasOfflineActive, saveOfflineActive } from '@/lib/offline-access';
import { SignOutButton } from './SignOutButton';
import { getPushToken, setPushToken } from './push-token';
import { ApiProvider } from './useApi';

// useSignOut clears the saved delegate passes, which loads the native storage wrapper.
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// The offline-access cache's native store, in memory.
const mockMemory = new Map<string, string>();
jest.mock('@/lib/large-secure-store', () => ({
  LargeSecureStore: class {
    getItem = async (k: string) => mockMemory.get(k) ?? null;
    setItem = async (k: string, v: string) => void mockMemory.set(k, v);
    removeItem = async (k: string) => void mockMemory.delete(k);
  },
}));

jest.mock('@/lib/supabase', () => ({
  getSupabase: () => {
    throw new Error('features must go through useApi, not the Supabase client');
  },
}));

const mockClearDraft = jest.fn();
jest.mock('@/features/profile/draft-store', () => ({
  clearDraft: () => mockClearDraft(),
}));

const mockSignOut = jest.fn();
const api = { auth: { signOut: mockSignOut }, _client: {} } as unknown as Api;

async function renderButton(queryClient: QueryClient) {
  await render(
    <ApiProvider api={api}>
      <QueryClientProvider client={queryClient}>
        <SignOutButton />
      </QueryClientProvider>
    </ApiProvider>,
  );
}

beforeEach(() => {
  mockSignOut.mockReset();
  mockClearDraft.mockReset();
  mockClearDraft.mockResolvedValue(undefined);
  mockSignOut.mockResolvedValue({ ok: true });
  setPushToken(undefined);
});

describe('sign out', () => {
  it('has no push token until P1-06 registers one', () => {
    expect(getPushToken()).toBeUndefined();
    setPushToken('ExponentPushToken[fake]');
    expect(getPushToken()).toBe('ExponentPushToken[fake]');
    setPushToken(null);
    expect(getPushToken()).toBeUndefined();
  });

  it('signs out with this device push token, then clears the query cache', async () => {
    setPushToken('ExponentPushToken[fake]');
    const queryClient = new QueryClient();
    queryClient.setQueryData(['members', 'me'], { full_name: 'Fake Person' });
    await renderButton(queryClient);
    expect(queryClient.getQueryData(['members', 'me'])).toBeDefined();

    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(queryClient.getQueryData(['members', 'me'])).toBeUndefined());
    expect(mockSignOut).toHaveBeenCalledWith({ pushToken: 'ExponentPushToken[fake]' });
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('wipes the saved profile draft (name, DOB, phone) so the next login never sees it', async () => {
    await renderButton(new QueryClient());
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(mockClearDraft).toHaveBeenCalledTimes(1));
  });

  it('clears the cache even when sign-out reports a failure', async () => {
    mockSignOut.mockResolvedValue({ ok: false, kind: 'offline', message: 'offline' });
    const queryClient = new QueryClient();
    queryClient.setQueryData(['events'], [1, 2, 3]);
    await renderButton(queryClient);
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(queryClient.getQueryData(['events'])).toBeUndefined());
  });

  it('clears the offline-access cache itself, even offline and with no SIGNED_OUT event', async () => {
    // Offline: the sign-out call fails and no session listener runs here at all.
    mockSignOut.mockResolvedValue({ ok: false, kind: 'offline', message: 'offline' });
    await saveOfflineActive('a0000000-0000-4000-8000-0000000000f1');
    expect(await hasOfflineActive('a0000000-0000-4000-8000-0000000000f1')).toBe(true);
    await renderButton(new QueryClient());
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(mockMemory.has(OFFLINE_ACTIVE_KEY)).toBe(false));
    expect(await hasOfflineActive('a0000000-0000-4000-8000-0000000000f1')).toBe(false);
  });
});
