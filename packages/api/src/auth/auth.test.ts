import type { Client } from '../index';
import { createApi } from '../index';
import { mapAuthError, parseRetryMinutes } from './errors';
import { createAuthApi } from './index';

type Mock = ReturnType<typeof makeClient>;

function makeClient() {
  const unsubscribe = jest.fn();
  const eq = jest.fn().mockResolvedValue({ error: null });
  const del = jest.fn(() => ({ eq }));
  const from = jest.fn(() => ({ delete: del }));
  const auth = {
    signInWithOtp: jest.fn().mockResolvedValue({ data: {}, error: null }),
    verifyOtp: jest.fn().mockResolvedValue({ data: {}, error: null }),
    signOut: jest.fn().mockResolvedValue({ error: null }),
    onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe } } })),
  };
  return { auth, from, del, eq, unsubscribe };
}

const asClient = (m: Mock) => m as unknown as Client;

// The phone-hook 429 as supabase-js surfaces it (see chunk 1 notes).
const hook429 = {
  name: 'AuthApiError',
  status: 429,
  message: 'Too many codes requested. Try again in 7 minutes.',
};

describe('mapAuthError', () => {
  it('maps the throttle 429 and parses the minutes', () => {
    expect(mapAuthError(hook429)).toEqual({
      ok: false,
      kind: 'rate_limited',
      message: 'Too many codes requested. Try again in 7 minutes.',
      retryAfterMinutes: 7,
    });
  });

  it('uses the singular for one minute', () => {
    const r = mapAuthError({ status: 429, message: 'Try again in 1 minute.' });
    expect(r.message).toBe('Too many codes requested. Try again in 1 minute.');
  });

  it('falls back to a generic wait text when a 429 carries no number', () => {
    const r = mapAuthError({ status: 429, code: 'over_sms_send_rate_limit', message: 'Slow down' });
    expect(r.kind).toBe('rate_limited');
    expect(r.retryAfterMinutes).toBeUndefined();
    expect(r.message).toMatch(/wait a few minutes/);
  });

  it('maps a wrong code', () => {
    const r = mapAuthError({
      status: 403,
      code: 'otp_expired',
      message: 'Token has expired or is invalid',
    });
    expect(r.kind).toBe('wrong_code');
    expect(r.message).toMatch(/incorrect/);
  });

  it('maps a plainly expired code', () => {
    const r = mapAuthError({ status: 403, message: 'OTP has expired' });
    expect(r.kind).toBe('expired_code');
    expect(r.message).toMatch(/expired/);
  });

  it('maps offline failures', () => {
    expect(
      mapAuthError({ name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' }).kind,
    ).toBe('offline');
    expect(mapAuthError(new TypeError('Network request failed')).kind).toBe('offline');
  });

  it('has a generic fallback that leaks nothing from the raw error', () => {
    const r = mapAuthError({ status: 500, message: 'db exploded for +919000000001' });
    expect(r.kind).toBe('unknown');
    expect(r.message).toBe('Something went wrong. Please try again.');
    expect(mapAuthError(undefined).kind).toBe('unknown');
  });
});

describe('parseRetryMinutes', () => {
  it('reads N or returns undefined', () => {
    expect(parseRetryMinutes('Try again in 42 minutes.')).toBe(42);
    expect(parseRetryMinutes('Try later')).toBeUndefined();
  });
});

describe('createAuthApi', () => {
  it('requestCode sends the phone through signInWithOtp', async () => {
    const m = makeClient();
    await expect(createAuthApi(asClient(m)).requestCode('+919000000001')).resolves.toEqual({
      ok: true,
    });
    expect(m.auth.signInWithOtp).toHaveBeenCalledWith({ phone: '+919000000001' });
  });

  it('requestCode maps the throttle error and never throws', async () => {
    const m = makeClient();
    m.auth.signInWithOtp.mockResolvedValue({ data: {}, error: hook429 });
    const r = await createAuthApi(asClient(m)).requestCode('+919000000001');
    expect(r).toMatchObject({ ok: false, kind: 'rate_limited', retryAfterMinutes: 7 });

    m.auth.signInWithOtp.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await createAuthApi(asClient(m)).requestCode('+919000000001')).toMatchObject({
      kind: 'offline',
    });
  });

  it('verifyCode uses type sms and maps a wrong code', async () => {
    const m = makeClient();
    const api = createAuthApi(asClient(m));
    await expect(api.verifyCode('+919000000001', '123456')).resolves.toEqual({ ok: true });
    expect(m.auth.verifyOtp).toHaveBeenCalledWith({
      phone: '+919000000001',
      token: '123456',
      type: 'sms',
    });

    m.auth.verifyOtp.mockResolvedValue({
      data: {},
      error: { status: 403, code: 'otp_expired', message: 'Token has expired or is invalid' },
    });
    const r = await api.verifyCode('+919000000001', '000000');
    expect(r).toMatchObject({ ok: false, kind: 'wrong_code' });
    expect(JSON.stringify(r)).not.toContain('000000');
  });

  it('signOut deletes this device push token, then signs out locally', async () => {
    const m = makeClient();
    await expect(
      createAuthApi(asClient(m)).signOut({ pushToken: 'ExponentPushToken[fake]' }),
    ).resolves.toEqual({ ok: true });
    expect(m.from).toHaveBeenCalledWith('push_tokens');
    expect(m.eq).toHaveBeenCalledWith('token', 'ExponentPushToken[fake]');
    expect(m.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(m.from.mock.invocationCallOrder[0]!).toBeLessThan(
      m.auth.signOut.mock.invocationCallOrder[0]!,
    );
  });

  it('signOut without a token skips the delete, and a failed delete does not block it', async () => {
    const m = makeClient();
    await createAuthApi(asClient(m)).signOut();
    expect(m.from).not.toHaveBeenCalled();
    expect(m.auth.signOut).toHaveBeenCalledTimes(1);

    m.eq.mockRejectedValue(new Error('rls'));
    await createAuthApi(asClient(m)).signOut({ pushToken: 't' });
    expect(m.auth.signOut).toHaveBeenCalledTimes(2);
  });

  it('onSession forwards sessions and returns an unsubscribe', () => {
    const m = makeClient();
    const cb = jest.fn();
    const off = createAuthApi(asClient(m)).onSession(cb);
    const handler = (
      m.auth.onAuthStateChange.mock.calls as unknown as [(e: string, s: unknown) => void][]
    )[0]![0];
    handler('SIGNED_IN', { access_token: 'x' });
    expect(cb).toHaveBeenCalledWith({ access_token: 'x' }, 'SIGNED_IN');
    off();
    expect(m.unsubscribe).toHaveBeenCalled();
  });

  it('is registered on createApi as api.auth', () => {
    const api = createApi(asClient(makeClient()));
    expect(Object.keys(api.auth).sort()).toEqual([
      'loadMembership',
      'onSession',
      'requestCode',
      'signOut',
      'startAutoRefresh',
      'stopAutoRefresh',
      'verifyCode',
    ]);
  });
});
