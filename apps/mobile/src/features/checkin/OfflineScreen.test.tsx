import type { Api } from '@aiaia/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ApiProvider } from '@/features/auth/useApi';
import { OfflineScreen } from './OfflineScreen';
import type { SavedPack } from './scan-types';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/lib/large-secure-store', () => ({
  LargeSecureStore: class {
    getItem = async () => null;
    setItem = async () => undefined;
    removeItem = async () => undefined;
  },
}));
jest.mock('@/lib/supabase', () => ({
  getSupabase: () => {
    throw new Error('features must go through useApi, not the Supabase client');
  },
}));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));

const OWNER = 'a0000000-0000-4000-8000-0000000000f1';
const EVENT = 'e0000000-0000-4000-8000-000000000001';
const EVENT2 = 'e0000000-0000-4000-8000-000000000002';
let mockPacks: SavedPack[] = [];
const mockOpened: string[] = [];
jest.mock('./scan-store', () => ({
  openScanStore: async (owner: string) => {
    mockOpened.push(owner);
    return { listPacks: async () => mockPacks };
  },
}));

const cacheOwner = jest.fn();
const api = {
  auth: { signOut: jest.fn().mockResolvedValue({ ok: true }) },
  checkin: { cacheOwner },
  _client: {},
} as unknown as Api;

const renderScreen = () =>
  render(
    <ApiProvider api={api}>
      <QueryClientProvider client={new QueryClient()}>
        <OfflineScreen />
      </QueryClientProvider>
    </ApiProvider>,
  );

beforeEach(() => {
  mockPush.mockReset();
  mockOpened.length = 0;
  cacheOwner.mockReset();
  cacheOwner.mockResolvedValue(OWNER);
  mockPacks = [
    { eventId: EVENT2, title: 'Fake Camp', downloadedAt: '2026-11-20T04:00:00.000Z' },
    { eventId: EVENT, title: null, downloadedAt: '2026-11-19T04:00:00.000Z' },
  ];
});

describe('offline screen', () => {
  it("lists this person's saved packs as links to their check-in screens", async () => {
    await renderScreen();
    await fireEvent.press(await screen.findByRole('button', { name: 'Check in: Fake Camp' }));
    expect(mockPush).toHaveBeenLastCalledWith(`/checkin/${EVENT2}`);
    // A pack saved before titles were stored is listed by its download time.
    await fireEvent.press(screen.getByRole('button', { name: /^Check in: pack saved / }));
    expect(mockPush).toHaveBeenLastCalledWith(`/checkin/${EVENT}`);
    expect(mockOpened).toEqual([OWNER]);
    await fireEvent.press(screen.getByRole('button', { name: 'My pass' }));
    expect(mockPush).toHaveBeenLastCalledWith('/pass');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
  });

  it('with no saved session owner, opens no store and lists nothing', async () => {
    cacheOwner.mockResolvedValue(null);
    await renderScreen();
    expect(await screen.findByRole('button', { name: 'My pass' })).toBeTruthy();
    expect(screen.queryByText('Saved event packs')).toBeNull();
    expect(mockOpened).toEqual([]);
  });
});
