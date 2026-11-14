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

type Listener = (session: unknown, event: string) => void;

let emit: Listener;
const mockOff = jest.fn();
const mockAuth = {
  onSession: jest.fn((cb: Listener) => {
    emit = cb;
    return mockOff;
  }),
  loadMembership: jest.fn(),
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
