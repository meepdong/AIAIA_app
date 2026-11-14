import type { Client } from '../index';
import { createSettingsApi } from '../settings';
import { createAuthApi, parseMembership } from './index';

describe('parseMembership', () => {
  it.each(['pending', 'active', 'rejected', 'suspended', 'deleted'] as const)(
    'reads status %s',
    (status) => {
      expect(
        parseMembership({ member: { status, adult_consent_required: false }, private: null }),
      ).toEqual({ status, adultConsentRequired: false });
    },
  );

  it('reads adult_consent_required only when it is exactly true', () => {
    const at = (v: unknown) =>
      parseMembership({ member: { status: 'active', adult_consent_required: v } });
    expect(at(true)?.adultConsentRequired).toBe(true);
    expect(at('true')?.adultConsentRequired).toBe(false);
    expect(at(undefined)?.adultConsentRequired).toBe(false);
  });

  it.each([null, undefined, 'x', 5, {}, { member: null }, { member: { status: 'admin' } }])(
    'treats %j as no member',
    (value) => {
      expect(parseMembership(value)).toBeNull();
    },
  );
});

describe('auth.loadMembership', () => {
  const clientWith = (rpc: jest.Mock) => ({ rpc }) as unknown as Client;

  it('returns the member from my_profile()', async () => {
    const rpc = jest
      .fn()
      .mockResolvedValue({ data: { member: { status: 'pending' } }, error: null });
    await expect(createAuthApi(clientWith(rpc)).loadMembership()).resolves.toEqual({
      ok: true,
      member: { status: 'pending', adultConsentRequired: false },
    });
    expect(rpc).toHaveBeenCalledWith('my_profile');
  });

  it('returns member null when my_profile() returns null', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null });
    await expect(createAuthApi(clientWith(rpc)).loadMembership()).resolves.toEqual({
      ok: true,
      member: null,
    });
  });

  it('returns a failure, never a member, when the call errors or throws', async () => {
    const failed = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await createAuthApi(clientWith(failed)).loadMembership()).toMatchObject({ ok: false });
    const thrown = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    expect(await createAuthApi(clientWith(thrown)).loadMembership()).toMatchObject({
      ok: false,
      kind: 'offline',
    });
  });
});

describe('auth auto refresh', () => {
  it('forwards start and stop to the auth client', async () => {
    const auth = {
      startAutoRefresh: jest.fn().mockResolvedValue(undefined),
      stopAutoRefresh: jest.fn().mockResolvedValue(undefined),
    };
    const api = createAuthApi({ auth } as unknown as Client);
    await api.startAutoRefresh();
    await api.stopAutoRefresh();
    expect(auth.startAutoRefresh).toHaveBeenCalledTimes(1);
    expect(auth.stopAutoRefresh).toHaveBeenCalledTimes(1);
  });
});

describe('settings.getSetting', () => {
  const clientWith = (maybeSingle: jest.Mock) =>
    ({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
    }) as unknown as Client;

  it('returns the value, or null for a missing row', async () => {
    const found = jest.fn().mockResolvedValue({ data: { value: true }, error: null });
    expect(await createSettingsApi(clientWith(found)).getSetting('k')).toEqual({
      ok: true,
      value: true,
    });
    const missing = jest.fn().mockResolvedValue({ data: null, error: null });
    expect(await createSettingsApi(clientWith(missing)).getSetting('k')).toEqual({
      ok: true,
      value: null,
    });
  });

  it('never throws', async () => {
    const failed = jest.fn().mockResolvedValue({ data: null, error: { message: 'x' } });
    expect(await createSettingsApi(clientWith(failed)).getSetting('k')).toEqual({ ok: false });
    const thrown = jest.fn().mockRejectedValue(new Error('offline'));
    expect(await createSettingsApi(clientWith(thrown)).getSetting('k')).toEqual({ ok: false });
  });
});
