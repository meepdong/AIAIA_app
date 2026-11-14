import { SESSION_STATES, homeRouteFor, isSessionState, useMockedSessionState } from './session';

describe('auth-gate stub', () => {
  it('routes each session state to its screen', () => {
    expect(homeRouteFor('signed_out')).toBe('/phone');
    expect(homeRouteFor('no_profile')).toBe('/profile-setup');
    expect(homeRouteFor('pending')).toBe('/waiting-room');
    expect(homeRouteFor('blocked')).toBe('/blocked');
    expect(homeRouteFor('active')).toBe('/home');
  });

  it('only lets an active member into the member area', () => {
    const intoMemberArea = SESSION_STATES.filter((s) => homeRouteFor(s) === '/home');
    expect(intoMemberArea).toEqual(['active']);
  });

  it('recognises valid states only', () => {
    expect(isSessionState('pending')).toBe(true);
    expect(isSessionState('admin')).toBe(false);
    expect(isSessionState(undefined)).toBe(false);
  });
});

describe('mock session override', () => {
  const g = globalThis as unknown as { __DEV__: boolean };
  const originalDev = g.__DEV__;
  const originalEnv = process.env.EXPO_PUBLIC_MOCK_SESSION;

  afterEach(() => {
    g.__DEV__ = originalDev;
    if (originalEnv === undefined) delete process.env.EXPO_PUBLIC_MOCK_SESSION;
    else process.env.EXPO_PUBLIC_MOCK_SESSION = originalEnv;
  });

  it('honours the override in dev builds', () => {
    g.__DEV__ = true;
    process.env.EXPO_PUBLIC_MOCK_SESSION = 'active';
    expect(useMockedSessionState()).toBe('active');
  });

  it('ignores the override outside dev builds', () => {
    g.__DEV__ = false;
    process.env.EXPO_PUBLIC_MOCK_SESSION = 'active';
    expect(useMockedSessionState()).toBe('signed_out');
  });
});
