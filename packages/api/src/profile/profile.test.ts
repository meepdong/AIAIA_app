import type { Client } from '../index';
import { createProfileApi, isValidClaimCode, normalizeClaimCode } from './index';

const PAYLOAD = {
  full_name: 'Aarav Testwala',
  dob: '2000-01-15',
  branch_id: '00000000-0000-4000-8000-000000000001',
};

function fakeClient(result: { data?: unknown; error?: unknown } | Error) {
  const rpc = jest.fn();
  if (result instanceof Error) rpc.mockRejectedValue(result);
  else rpc.mockResolvedValue({ data: result.data ?? null, error: result.error ?? null });
  const refreshSession = jest.fn().mockResolvedValue({});
  return { client: { rpc, auth: { refreshSession } } as unknown as Client, rpc, refreshSession };
}

const pgError = (code: string, message: string) => ({ code, message });

describe('profile api: submitApplication', () => {
  it('sends the payload to submit_application and returns the result', async () => {
    const { client, rpc } = fakeClient({
      data: { member_id: 'm1', status: 'pending', wing: 'youth', fast_track: false },
    });
    const result = await createProfileApi(client).submitApplication(PAYLOAD);
    expect(rpc).toHaveBeenCalledWith('submit_application', { payload: PAYLOAD });
    expect(result).toEqual({
      ok: true,
      member_id: 'm1',
      status: 'pending',
      wing: 'youth',
      fast_track: false,
    });
  });

  it('maps a DOB change while a guardian link is active (42501) to friendly text', async () => {
    const { client } = fakeClient({
      error: pgError(
        '42501',
        'submit_application: date of birth can only be changed by an officer while a guardian link is active',
      ),
    });
    const result = await createProfileApi(client).submitApplication(PAYLOAD);
    expect(result).toMatchObject({ ok: false, kind: 'dob_locked' });
    if (!result.ok) {
      expect(result.message).toContain("can't be changed here");
      expect(result.message).not.toMatch(/submit_application|42501/);
    }
  });

  it('maps a signed-out 42501 to a sign-in message, not the DOB message', async () => {
    const { client } = fakeClient({ error: pgError('42501', 'submit_application: sign in first') });
    expect(await createProfileApi(client).submitApplication(PAYLOAD)).toMatchObject({
      ok: false,
      kind: 'signed_out',
    });
  });

  it('maps under 14 (23514) to "ask a parent or guardian to add you"', async () => {
    const { client } = fakeClient({
      error: pgError('23514', 'submit_application: under 14, ask a parent or guardian to add you'),
    });
    const result = await createProfileApi(client).submitApplication(PAYLOAD);
    expect(result).toEqual({
      ok: false,
      kind: 'under_age',
      message: 'Ask a parent or guardian to add you.',
    });
  });

  it('maps an already reviewed application (23514) to not_pending', async () => {
    const { client } = fakeClient({
      error: pgError('23514', 'submit_application: only a pending application can be changed'),
    });
    expect(await createProfileApi(client).submitApplication(PAYLOAD)).toMatchObject({
      ok: false,
      kind: 'not_pending',
    });
  });

  it.each([
    ['submit_application: email is not valid', 'Enter a valid email address.'],
    ['submit_application: unknown branch', 'Choose your branch.'],
    [
      'submit_application: emergency_contact_phone must be in +<country><number> form',
      'Enter the emergency contact number with 10 digits.',
    ],
  ])('maps validation error %s', async (message, friendly) => {
    const { client } = fakeClient({ error: pgError('22023', message) });
    expect(await createProfileApi(client).submitApplication(PAYLOAD)).toMatchObject({
      ok: false,
      kind: 'invalid_input',
      message: friendly,
    });
  });

  it('reports a network failure as offline, and never throws', async () => {
    const { client } = fakeClient(new TypeError('Network request failed'));
    expect(await createProfileApi(client).submitApplication(PAYLOAD)).toMatchObject({
      ok: false,
      kind: 'offline',
    });
  });

  it('falls back to a generic message for an unknown error', async () => {
    const { client } = fakeClient({ error: pgError('XX000', 'secret internal detail') });
    const result = await createProfileApi(client).submitApplication(PAYLOAD);
    expect(result).toMatchObject({ ok: false, kind: 'unknown' });
    if (!result.ok) expect(result.message).not.toContain('secret');
  });
});

describe('claim code helpers', () => {
  it('normalises case, spaces and dashes', () => {
    expect(normalizeClaimCode(' ab3d-ef9h ')).toBe('AB3DEF9H');
  });

  it('accepts 8 characters from A-Z and 2-9 only', () => {
    expect(isValidClaimCode('AB3DEF9H')).toBe(true);
    expect(isValidClaimCode('ab3d ef9h')).toBe(true);
    expect(isValidClaimCode('AB3DEF9')).toBe(false); // 7
    expect(isValidClaimCode('AB3DEF9HJ')).toBe(false); // 9
    expect(isValidClaimCode('AB3DEF0H')).toBe(false); // 0
    expect(isValidClaimCode('AB3DEFOH')).toBe(false); // O
    expect(isValidClaimCode('AB3DEF1H')).toBe(false); // 1
    expect(isValidClaimCode('AB3DEFIH')).toBe(false); // I
  });
});

describe('profile api: graduateDependent', () => {
  it('redeems a normalised code and returns the outcome', async () => {
    const { client, rpc } = fakeClient({
      data: {
        ok: true,
        member_id: 'm9',
        status: 'active',
        adult_consent_required: true,
        guardian_links_ended: true,
      },
    });
    const result = await createProfileApi(client).graduateDependent('ab3d-ef9h');
    expect(rpc).toHaveBeenCalledWith('graduate_dependent', { code: 'AB3DEF9H' });
    expect(result).toEqual({
      ok: true,
      memberId: 'm9',
      status: 'active',
      adultConsentRequired: true,
      guardianLinksEnded: true,
    });
  });

  it('refuses a malformed code without calling the server', async () => {
    const { client, rpc } = fakeClient({ data: { ok: true } });
    const result = await createProfileApi(client).graduateDependent('ABC');
    expect(result).toMatchObject({ ok: false, kind: 'bad_code_format' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('maps {ok:false, error:"invalid_code"} to friendly text', async () => {
    const { client } = fakeClient({ data: { ok: false, error: 'invalid_code' } });
    const result = await createProfileApi(client).graduateDependent('AB3DEF9H');
    expect(result).toMatchObject({ ok: false, kind: 'invalid_code' });
    if (!result.ok) expect(result.message).toMatch(/not valid or has expired/);
  });

  it('maps PT429 (too many wrong codes) to friendly text', async () => {
    const { client } = fakeClient({
      error: pgError('PT429', 'graduate_dependent: too many wrong codes, try again later'),
    });
    const result = await createProfileApi(client).graduateDependent('AB3DEF9H');
    expect(result).toMatchObject({ ok: false, kind: 'rate_limited' });
    if (!result.ok) expect(result.message).toMatch(/Too many wrong codes/);
  });

  it('maps an HTTP 429 without a code to rate_limited too', async () => {
    const { client } = fakeClient({ error: { status: 429, message: 'Too Many Requests' } });
    expect(await createProfileApi(client).graduateDependent('AB3DEF9H')).toMatchObject({
      ok: false,
      kind: 'rate_limited',
    });
  });

  it('maps a login that already belongs to a member (23514)', async () => {
    const { client } = fakeClient({
      error: pgError('23514', 'graduate_dependent: this login already belongs to a member'),
    });
    expect(await createProfileApi(client).graduateDependent('AB3DEF9H')).toMatchObject({
      ok: false,
      kind: 'already_member',
    });
  });

  it('reports a network failure as offline', async () => {
    const { client } = fakeClient(new TypeError('Failed to fetch'));
    expect(await createProfileApi(client).graduateDependent('AB3DEF9H')).toMatchObject({
      ok: false,
      kind: 'offline',
    });
  });
});

describe('profile api: userId', () => {
  it('reads the id from the stored session, or null', async () => {
    const getSession = jest
      .fn()
      .mockResolvedValueOnce({ data: { session: { user: { id: 'u1' } } } })
      .mockResolvedValueOnce({ data: { session: null } })
      .mockRejectedValueOnce(new Error('boom'));
    const api = createProfileApi({ auth: { getSession } } as unknown as Client);
    expect(await api.userId()).toBe('u1');
    expect(await api.userId()).toBeNull();
    expect(await api.userId()).toBeNull();
  });
});

describe('profile api: refreshSession', () => {
  it('asks Supabase for a fresh token, and swallows a failure', async () => {
    const { client, refreshSession } = fakeClient({});
    await createProfileApi(client).refreshSession();
    expect(refreshSession).toHaveBeenCalledTimes(1);
    refreshSession.mockRejectedValueOnce(new Error('offline'));
    await expect(createProfileApi(client).refreshSession()).resolves.toBeUndefined();
  });
});
