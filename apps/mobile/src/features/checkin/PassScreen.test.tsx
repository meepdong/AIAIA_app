import { PassError, type Api, type MemberPass } from '@aiaia/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SignOutButton } from '@/features/auth/SignOutButton';
import { ApiProvider } from '@/features/auth/useApi';
import { PassScreen } from './PassScreen';
import { loadPassCache, passCacheKey, savePassCache } from './pass-cache';

jest.mock('@/lib/supabase', () => ({
  getSupabase: () => {
    throw new Error('features must go through useApi, not the Supabase client');
  },
}));

// In-memory stand-in for the encrypted native store.
const mockMemory = new Map<string, string>();
jest.mock('@/lib/large-secure-store', () => ({
  LargeSecureStore: class {
    async getItem(k: string) {
      return mockMemory.get(k) ?? null;
    }
    async setItem(k: string, v: string) {
      mockMemory.set(k, v);
    }
    async removeItem(k: string) {
      mockMemory.delete(k);
    }
  },
}));

// Render the SVG xml as text so a test can tell which QR was drawn.
jest.mock('react-native-svg', () => {
  const { Text } = jest.requireActual('react-native');
  return { SvgXml: ({ xml }: { xml: string }) => <Text testID="svg">{xml}</Text> };
});
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-print', () => ({ printAsync: jest.fn() }));

const USER = '11111111-1111-4111-8111-111111111111';
const WARD = '22222222-2222-4222-8222-222222222222';

const mine: MemberPass = {
  member_id: USER,
  full_name: 'Asha Fake',
  branch_name: 'Test Branch',
  pass_version: 1,
  is_self: true,
  qr: 'AIAIA1.self-qr',
};
const ward: MemberPass = {
  member_id: WARD,
  full_name: 'Ravi Fake',
  branch_name: 'Test Branch',
  pass_version: 2,
  is_self: false,
  qr: 'AIAIA1.ward-qr',
};

const mockMyPasses = jest.fn();
const mockCacheOwner = jest.fn();
const mockSignOut = jest.fn();
const api = {
  checkin: { myPasses: mockMyPasses, cacheOwner: mockCacheOwner },
  auth: { signOut: mockSignOut },
  _client: {},
} as unknown as Api;

function wrap(node: React.ReactNode) {
  return (
    <ApiProvider api={api}>
      <QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>
    </ApiProvider>
  );
}

beforeEach(() => {
  mockMemory.clear();
  mockMyPasses.mockReset();
  mockCacheOwner.mockReset().mockResolvedValue(USER);
  mockSignOut.mockReset().mockResolvedValue({ ok: true });
});

describe('pass screen', () => {
  it('draws a QR, name and branch for the caller and for a dependent', async () => {
    mockMyPasses.mockResolvedValue([mine, ward]);
    await render(wrap(<PassScreen />));

    expect(await screen.findByText('Asha Fake')).toBeTruthy();
    expect(screen.getByText('Ravi Fake')).toBeTruthy();
    expect(screen.getAllByText('Test Branch')).toHaveLength(2);
    await waitFor(() => expect(screen.getAllByTestId('svg')).toHaveLength(2));
    expect(screen.getByTestId(`pass-qr-${USER}`)).toBeTruthy();
    expect(screen.getByTestId(`pass-qr-${WARD}`)).toBeTruthy();
    // Two different passes give two different codes.
    const [a, b] = screen.getAllByTestId('svg').map((n) => String(n.props.children));
    expect(a).toContain('<svg');
    expect(a).not.toEqual(b);
    expect(screen.queryByText(/last updated/)).toBeNull();
    // The fresh passes are cached for next time.
    expect((await loadPassCache(USER))?.passes).toHaveLength(2);
  });

  it('shows the cached passes with a last-updated note when offline', async () => {
    await savePassCache(USER, [mine, ward]);
    mockMyPasses.mockRejectedValue(new PassError('offline'));
    await render(wrap(<PassScreen />));

    expect(await screen.findByText('Asha Fake')).toBeTruthy();
    expect(screen.getByText('Ravi Fake')).toBeTruthy();
    expect(screen.getByText(/last updated/)).toBeTruthy();
    await waitFor(() => expect(screen.getAllByTestId('svg')).toHaveLength(2));
  });

  it('says so when offline with nothing saved', async () => {
    mockMyPasses.mockRejectedValue(new PassError('offline'));
    await render(wrap(<PassScreen />));
    expect(await screen.findByText(/no pass has been saved/)).toBeTruthy();
  });

  it("says passes aren't set up yet when the server has no signing key", async () => {
    await savePassCache(USER, [mine]);
    mockMyPasses.mockRejectedValue(new PassError('not_configured'));
    await render(wrap(<PassScreen />));
    expect(await screen.findByText("Passes aren't set up yet.")).toBeTruthy();
    expect(screen.queryByText('Asha Fake')).toBeNull();
  });

  it('offers retry on other failures, and prints with the same pass', async () => {
    mockMyPasses.mockRejectedValueOnce(new PassError('failed'));
    mockMyPasses.mockResolvedValueOnce([mine]);
    await render(wrap(<PassScreen />));
    await fireEvent.press(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Asha Fake')).toBeTruthy();

    await waitFor(() => expect(screen.getAllByTestId('svg')).toHaveLength(1));
    const Print = jest.requireMock('expo-print') as { printAsync: jest.Mock };
    await fireEvent.press(screen.getByRole('button', { name: 'Print' }));
    await waitFor(() => expect(Print.printAsync).toHaveBeenCalledTimes(1));
    expect(Print.printAsync.mock.calls[0][0].html).toContain('Asha Fake');
    expect(Print.printAsync.mock.calls[0][0].html).toContain('<svg');
  });
});

describe('sign out and the pass cache', () => {
  it('removes the saved passes of the signed-out user', async () => {
    await savePassCache(USER, [mine]);
    expect(mockMemory.has(passCacheKey(USER))).toBe(true);
    await render(wrap(<SignOutButton />));

    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(mockMemory.has(passCacheKey(USER))).toBe(false));
    expect(mockSignOut).toHaveBeenCalled();
  });
});
