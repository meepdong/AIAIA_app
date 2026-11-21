import type { Api, Membership } from '@aiaia/api';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState, Pressable, Text } from 'react-native';
import { ApiProvider } from '@/features/auth/useApi';
import {
  PROFILE_RETRY_MS,
  SessionProvider,
  homeRouteFor,
  stateForMembership,
  useRefreshMembership,
  useSessionState,
} from './session';

jest.mock('@/lib/supabase', () => ({
  getSupabase: () => {
    throw new Error('missing config');
  },
}));

const mockClearAll = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/checkin/scan-store', () => ({
  clearAllScanData: () => mockClearAll(),
  purgeExpiredScanData: jest.fn().mockResolvedValue(undefined),
}));

// The cache's native store, in memory.
const mockStore = new Map<string, string>();
let mockRemoveFails = false; // a store whose delete throws
let mockSetGate: Promise<void> | null = null; // holds a write until released
jest.mock('./large-secure-store', () => ({
  LargeSecureStore: class {
    getItem = async (k: string) => mockStore.get(k) ?? null;
    setItem = async (k: string, v: string) => {
      if (mockSetGate) await mockSetGate;
      mockStore.set(k, v);
    };
    removeItem = async (k: string) => {
      if (mockRemoveFails) throw new Error('remove failed');
      mockStore.delete(k);
    };
  },
}));

type Listener = (session: unknown, event: string) => void;

let emit: Listener;
const mockOff = jest.fn();
const mockAuth = {
  onSession: jest.fn((cb: Listener) => {
    emit = cb;
    return mockOff;
  }),
  loadMembership: jest.fn(),
  storedUserId: jest.fn().mockResolvedValue(null),
  startAutoRefresh: jest.fn().mockResolvedValue(undefined),
  stopAutoRefresh: jest.fn().mockResolvedValue(undefined),
};
const api = { auth: mockAuth, _client: {} } as unknown as Api;
const SESSION = { user: { id: 'user-1' } };

function Probe() {
  const state = useSessionState();
  return (
    <>
      <Text testID="state">{state}</Text>
      <Text testID="route">{homeRouteFor(state)}</Text>
    </>
  );
}

async function renderGate() {
  await render(
    <ApiProvider api={api}>
      <SessionProvider>
        <Probe />
      </SessionProvider>
    </ApiProvider>,
  );
}
const state = () => screen.getByTestId('state').props.children;
const route = () => screen.getByTestId('route').props.children;

const member = (status: Membership['status'], adultConsentRequired = false) => ({
  ok: true,
  member: { status, adultConsentRequired },
});
async function signIn(result: unknown) {
  mockAuth.loadMembership.mockResolvedValue(result);
  await act(async () => emit(SESSION, 'INITIAL_SESSION'));
}

beforeEach(() => {
  jest.useRealTimers();
  mockOff.mockClear();
  mockAuth.onSession.mockClear();
  mockAuth.loadMembership.mockReset();
});

describe('auth gate: every state routes to its screen', () => {
  it('loading: before the first session event, nobody is let in', async () => {
    await renderGate();
    expect(state()).toBe('loading');
    expect(route()).toBe('/phone');
  });

  it('signed_out: no session goes to the phone screen', async () => {
    await renderGate();
    await act(async () => emit(null, 'INITIAL_SESSION'));
    expect(state()).toBe('signed_out');
    expect(route()).toBe('/phone');
    expect(mockAuth.loadMembership).not.toHaveBeenCalled();
  });

  it('no_profile: a session without a member row goes to profile setup', async () => {
    await renderGate();
    await signIn({ ok: true, member: null });
    expect(state()).toBe('no_profile');
    expect(route()).toBe('/profile-setup');
  });

  it('pending: the waiting room', async () => {
    await renderGate();
    await signIn(member('pending'));
    expect(state()).toBe('pending');
    expect(route()).toBe('/waiting-room');
  });

  it.each(['rejected', 'suspended', 'deleted'] as const)('blocked: %s', async (status) => {
    await renderGate();
    await signIn(member(status));
    expect(state()).toBe('blocked');
    expect(route()).toBe('/blocked');
  });

  it('adult_consent: an active member awaiting the 18th-birthday handover', async () => {
    await renderGate();
    await signIn(member('active', true));
    expect(state()).toBe('adult_consent');
    expect(route()).toBe('/adult-consent');
  });

  it('active: the member app', async () => {
    await renderGate();
    await signIn(member('active'));
    expect(state()).toBe('active');
    expect(route()).toBe('/home');
  });

  it('adult_consent_required never lifts a non-active status', () => {
    expect(stateForMembership({ status: 'pending', adultConsentRequired: true })).toBe('pending');
    expect(stateForMembership({ status: 'suspended', adultConsentRequired: true })).toBe('blocked');
  });
});

describe('auth gate: session changes', () => {
  it('holds on loading while my_profile() resolves after a sign-in', async () => {
    await renderGate();
    await act(async () => emit(null, 'INITIAL_SESSION'));
    let resolve!: (v: unknown) => void;
    mockAuth.loadMembership.mockReturnValue(new Promise((r) => (resolve = r)));
    await act(async () => emit(SESSION, 'SIGNED_IN'));
    expect(state()).toBe('loading');
    await act(async () => resolve(member('active')));
    expect(state()).toBe('active');
  });

  it('signing out drops an active member back to the phone screen', async () => {
    await renderGate();
    await signIn(member('active'));
    await act(async () => emit(null, 'SIGNED_OUT'));
    expect(state()).toBe('signed_out');
    expect(route()).toBe('/phone');
  });

  it('a token refresh re-reads my_profile(), so an approval or suspension shows up', async () => {
    await renderGate();
    await signIn(member('pending'));
    await signIn(member('suspended'));
    expect(state()).toBe('blocked');
  });

  it('a late answer for an older session never overrides a sign-out', async () => {
    await renderGate();
    let resolve!: (v: unknown) => void;
    mockAuth.loadMembership.mockReturnValue(new Promise((r) => (resolve = r)));
    await act(async () => emit(SESSION, 'INITIAL_SESSION'));
    await act(async () => emit(null, 'SIGNED_OUT'));
    await act(async () => resolve(member('active')));
    expect(state()).toBe('signed_out');
  });

  it('fails closed: a failed my_profile() never lets anyone in, then retries', async () => {
    jest.useFakeTimers();
    await renderGate();
    mockAuth.loadMembership.mockResolvedValue({ ok: false, kind: 'offline', message: 'x' });
    await act(async () => emit(SESSION, 'INITIAL_SESSION'));
    expect(state()).toBe('loading');
    mockAuth.loadMembership.mockResolvedValue(member('active'));
    await act(async () => {
      jest.advanceTimersByTime(PROFILE_RETRY_MS);
    });
    expect(state()).toBe('active');
  });

  it('keeps the current state when a later refresh fails', async () => {
    jest.useFakeTimers();
    await renderGate();
    await signIn(member('pending'));
    await signIn({ ok: false, kind: 'offline', message: 'x' });
    expect(state()).toBe('pending');
  });

  it('unsubscribes on unmount', async () => {
    await renderGate();
    await screen.unmount();
    expect(mockOff).toHaveBeenCalledTimes(1);
  });
});

describe('auth gate: configuration and dev override', () => {
  const g = globalThis as unknown as { __DEV__: boolean };
  const originalDev = g.__DEV__;
  const originalEnv = process.env.EXPO_PUBLIC_MOCK_SESSION;
  afterEach(() => {
    g.__DEV__ = originalDev;
    if (originalEnv === undefined) delete process.env.EXPO_PUBLIC_MOCK_SESSION;
    else process.env.EXPO_PUBLIC_MOCK_SESSION = originalEnv;
  });

  it('shows the phone screen when Supabase is not configured', async () => {
    await render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    expect(state()).toBe('signed_out');
  });

  it('EXPO_PUBLIC_MOCK_SESSION wins in dev builds and never touches the API', async () => {
    g.__DEV__ = true;
    process.env.EXPO_PUBLIC_MOCK_SESSION = 'active';
    await renderGate();
    expect(state()).toBe('active');
    expect(mockAuth.onSession).not.toHaveBeenCalled();
  });

  it('ignores the override outside dev builds', async () => {
    g.__DEV__ = false;
    process.env.EXPO_PUBLIC_MOCK_SESSION = 'active';
    await renderGate();
    expect(state()).toBe('loading');
    expect(mockAuth.onSession).toHaveBeenCalled();
  });
});

describe('session ending without a sign-out press', () => {
  it('clears the saved event packs on this device; a live session does not', async () => {
    mockClearAll.mockClear();
    await renderGate();
    await signIn(member('active'));
    expect(mockClearAll).not.toHaveBeenCalled();
    await act(async () => emit(null, 'SIGNED_OUT'));
    expect(state()).toBe('signed_out');
    expect(mockClearAll).toHaveBeenCalledTimes(1);
  });
});

describe('offline cold start (owner decision M3)', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const OFFLINE = { ok: false, kind: 'offline', message: 'x' };
  const cache = (userId: string, ageMs: number) =>
    mockStore.set(
      'aiaia.offline_active.v1',
      JSON.stringify({ userId, confirmedAt: Date.now() - ageMs }),
    );
  const cached = () => mockStore.get('aiaia.offline_active.v1') ?? null;
  beforeEach(() => {
    mockStore.clear();
    mockRemoveFails = false;
    mockSetGate = null;
    mockClearAll.mockClear();
    mockAuth.storedUserId.mockReset().mockResolvedValue(null);
  });

  it('a server-confirmed active result is cached for this user; nothing else is', async () => {
    await renderGate();
    await signIn(member('pending'));
    expect(cached()).toBeNull();
    await signIn(member('active'));
    expect(JSON.parse(cached()!).userId).toBe('user-1');
  });

  it('a fresh cache and a failed (offline) my_profile() give offline_active', async () => {
    cache('user-1', 6 * DAY);
    await renderGate();
    await signIn(OFFLINE);
    expect(state()).toBe('offline_active');
    expect(route()).toBe('/offline');
  });

  it('an expired access token offline (null start-up session, saved session kept) also works, and keeps the packs', async () => {
    cache('user-1', DAY);
    mockAuth.storedUserId.mockResolvedValue('user-1');
    await renderGate();
    await act(async () => emit(null, 'INITIAL_SESSION'));
    expect(state()).toBe('offline_active');
    expect(mockClearAll).not.toHaveBeenCalled();
  });

  it('an offline token-refresh failure never wipes the packs, even without a cache', async () => {
    mockAuth.storedUserId.mockResolvedValue('user-1');
    await renderGate();
    await act(async () => emit(null, 'INITIAL_SESSION'));
    expect(state()).toBe('loading');
    expect(mockClearAll).not.toHaveBeenCalled();
  });

  it.each([
    ['an 8-day-old cache', 'user-1', 8 * DAY],
    ["another user's cache", 'user-2', DAY],
    ['a cache from the future (clock moved back)', 'user-1', -DAY],
  ])('%s gives no access: the spinner stays', async (_label, userId, age) => {
    cache(userId, age);
    await renderGate();
    await signIn(OFFLINE);
    expect(state()).toBe('loading');
  });

  it('a non-network failure never uses the cache', async () => {
    cache('user-1', DAY);
    await renderGate();
    await signIn({ ok: false, kind: 'unknown', message: 'x' });
    expect(state()).toBe('loading');
  });

  it('back online, a non-active answer replaces offline_active and deletes the cache', async () => {
    jest.useFakeTimers();
    cache('user-1', DAY);
    await renderGate();
    await signIn(OFFLINE);
    expect(state()).toBe('offline_active');
    mockAuth.loadMembership.mockResolvedValue(member('suspended'));
    await act(async () => {
      jest.advanceTimersByTime(PROFILE_RETRY_MS);
    });
    expect(state()).toBe('blocked');
    expect(cached()).toBeNull();
  });

  it('a real sign-out (SIGNED_OUT) deletes the cache and the packs, on its own (a saved session id exists)', async () => {
    mockAuth.storedUserId.mockResolvedValue('user-1');
    await renderGate();
    await signIn(member('active'));
    expect(cached()).not.toBeNull();
    await act(async () => emit(null, 'SIGNED_OUT'));
    expect(cached()).toBeNull();
    expect(mockClearAll).toHaveBeenCalledTimes(1);
  });

  it('a failed delete still leaves no offline access (the revoke overwrites first)', async () => {
    cache('user-1', DAY);
    mockRemoveFails = true;
    await renderGate();
    await signIn(member('suspended'));
    expect(state()).toBe('blocked');
    await screen.unmount();
    await renderGate();
    await signIn(OFFLINE);
    expect(state()).toBe('loading');
  });

  it('an active answer that lands after SIGNED_OUT leaves no cache', async () => {
    let release!: () => void;
    mockSetGate = new Promise<void>((r) => (release = r));
    await renderGate();
    mockAuth.loadMembership.mockResolvedValue(member('active'));
    await act(async () => emit(SESSION, 'INITIAL_SESSION'));
    await act(async () => emit(null, 'SIGNED_OUT'));
    await act(async () => {
      release();
    });
    expect(cached()).toBeNull();
    expect(state()).toBe('signed_out');
  });

  it('no saved session at all is signed_out and clears the packs', async () => {
    cache('user-1', DAY);
    await renderGate();
    await act(async () => emit(null, 'INITIAL_SESSION'));
    expect(state()).toBe('signed_out');
    expect(cached()).toBeNull();
    expect(mockClearAll).toHaveBeenCalledTimes(1);
  });
});

describe('foreground refresh (native)', () => {
  it('starts auto-refresh in the foreground and stops it in the background', async () => {
    const remove = jest.fn();
    const spy = jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove });
    mockAuth.startAutoRefresh.mockClear();
    mockAuth.stopAutoRefresh.mockClear();
    try {
      await renderGate();
      expect(spy).toHaveBeenCalledWith('change', expect.any(Function));
      const onChange = spy.mock.calls[0]![1] as (s: string) => void;

      mockAuth.startAutoRefresh.mockClear();
      mockAuth.stopAutoRefresh.mockClear();
      onChange('background');
      expect(mockAuth.stopAutoRefresh).toHaveBeenCalledTimes(1);
      expect(mockAuth.startAutoRefresh).not.toHaveBeenCalled();
      onChange('active');
      expect(mockAuth.startAutoRefresh).toHaveBeenCalledTimes(1);

      await screen.unmount();
      expect(remove).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('refreshMembership', () => {
  let last: unknown;
  let appState: jest.SpyInstance;
  beforeEach(() => {
    appState = jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() });
  });
  afterEach(() => appState.mockRestore());
  function RefreshProbe() {
    const refresh = useRefreshMembership();
    return (
      <Pressable
        accessibilityRole="button"
        onPress={async () => {
          last = await refresh();
        }}
      >
        <Text>refresh</Text>
      </Pressable>
    );
  }
  async function renderWithRefresh() {
    await render(
      <ApiProvider api={api}>
        <SessionProvider>
          <Probe />
          <RefreshProbe />
        </SessionProvider>
      </ApiProvider>,
    );
  }

  it('re-reads my_profile() and moves a pending member to active', async () => {
    await renderWithRefresh();
    await signIn(member('pending'));
    expect(state()).toBe('pending');
    mockAuth.loadMembership.mockResolvedValue(member('active'));
    await fireEvent.press(screen.getByRole('button', { name: 'refresh' }));
    expect(state()).toBe('active');
    expect(last).toBe('active');
  });

  it('a failed read leaves the state alone and never opens the app', async () => {
    await renderWithRefresh();
    await signIn(member('pending'));
    mockAuth.loadMembership.mockResolvedValue({ ok: false, kind: 'offline', message: 'x' });
    await fireEvent.press(screen.getByRole('button', { name: 'refresh' }));
    expect(state()).toBe('pending');
    expect(last).toBeNull();
  });

  it('after sign-out a refresh does nothing: no my_profile call, no retry loop', async () => {
    jest.useFakeTimers();
    await renderWithRefresh();
    await signIn(member('active'));
    await act(async () => emit(null, 'SIGNED_OUT'));
    mockAuth.loadMembership.mockReset();
    mockAuth.loadMembership.mockResolvedValue({ ok: false, kind: 'offline', message: 'x' });
    last = 'unset';
    await fireEvent.press(screen.getByRole('button', { name: 'refresh' }));
    await act(async () => {
      jest.advanceTimersByTime(PROFILE_RETRY_MS * 3);
    });
    expect(last).toBeNull();
    expect(mockAuth.loadMembership).not.toHaveBeenCalled();
    expect(state()).toBe('signed_out');
  });
});
