import type { Api } from '@aiaia/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SignOutButton } from './SignOutButton';
import { getPushToken, setPushToken } from './push-token';
import { ApiProvider } from './useApi';

jest.mock('@/lib/supabase', () => ({
  getSupabase: () => {
    throw new Error('features must go through useApi, not the Supabase client');
  },
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

  it('clears the cache even when sign-out reports a failure', async () => {
    mockSignOut.mockResolvedValue({ ok: false, kind: 'offline', message: 'offline' });
    const queryClient = new QueryClient();
    queryClient.setQueryData(['events'], [1, 2, 3]);
    await renderButton(queryClient);
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(queryClient.getQueryData(['events'])).toBeUndefined());
  });
});
