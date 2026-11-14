import type { Client } from '../index';
import { createManageMethods, type UpdateProfileInput } from './manage';

type Result = { data?: unknown; error?: unknown };

/** A chainable stand-in for a Supabase query: every call returns itself and awaiting yields `result`. */
function builder(result: Result | Error) {
  const calls: { method: string; args: unknown[] }[] = [];
  const b: Record<string, unknown> = {};
  for (const method of ['select', 'update', 'eq', 'order', 'limit']) {
    b[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return b;
    };
  }
  const settle = () =>
    result instanceof Error
      ? Promise.reject(result)
      : Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
  b.maybeSingle = (...args: unknown[]) => {
    calls.push({ method: 'maybeSingle', args });
    return settle();
  };
  b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    settle().then(resolve, reject);
  return { b, calls };
}

function fakeClient(opts: { rpc?: Result | Error; tables?: Record<string, (Result | Error)[]> }) {
  const rpc = jest.fn();
  const rpcResult = opts.rpc ?? {};
  if (rpcResult instanceof Error) rpc.mockRejectedValue(rpcResult);
  else rpc.mockResolvedValue({ data: rpcResult.data ?? null, error: rpcResult.error ?? null });
  const queues = { ...(opts.tables ?? {}) };
  const made: Record<string, ReturnType<typeof builder>[]> = {};
  const from = jest.fn((table: string) => {
    const next = queues[table]?.shift();
    if (!next) throw new Error(`unexpected query on ${table}`);
    const q = builder(next);
    (made[table] ??= []).push(q);
    return q.b;
  });
  return { client: { rpc, from } as unknown as Client, rpc, from, made };
}

function q(made: Record<string, ReturnType<typeof builder>[]>, table: string, i: number) {
  const found = made[table]?.[i];
  if (!found) throw new Error(`no query ${i} on ${table}`);
  return found;
}

const pgError = (code: string, message: string) => ({ code, message });
const M = '00000000-0000-4000-8000-0000000000a1';

const INPUT: UpdateProfileInput = {
  memberId: M,
  fullName: 'Aarav Testwala',
  gender: 'male',
  city: 'Pune',
  occupation: null,
  education: 'BSc',
  emergencyContactName: 'Diya Testwala',
  emergencyContactPhone: '+919000000011',
  whatsappOptIn: true,
  emailUpdatesOptIn: false,
  privacy: {
    show_phone: false,
    show_email: true,
    show_city: true,
    show_occupation: false,
    show_photo: true,
  },
};

const updateArg = (q: { calls: { method: string; args: unknown[] }[] }) =>
  q.calls.find((c) => c.method === 'update')?.args[0] as Record<string, unknown>;

describe('manage api: myProfile', () => {
  it('returns the profile, or null when there is no member row', async () => {
    const profile = { member: { id: M }, private: null, dependents: [] };
    const a = fakeClient({ rpc: { data: profile } });
    expect(await createManageMethods(a.client).myProfile()).toEqual({ ok: true, profile });
    expect(a.rpc).toHaveBeenCalledWith('my_profile');
    const b = fakeClient({ rpc: { data: null } });
    expect(await createManageMethods(b.client).myProfile()).toEqual({ ok: true, profile: null });
  });

  it('maps an offline failure to friendly text and never throws', async () => {
    const { client } = fakeClient({ rpc: new TypeError('Network request failed') });
    const r = await createManageMethods(client).myProfile();
    expect(r).toMatchObject({ ok: false, kind: 'offline' });
  });
});

describe('manage api: infoRequests', () => {
  it('keeps rows with a text message, newest first, and drops the rest', async () => {
    const { client, made } = fakeClient({
      rpc: { data: M },
      tables: {
        notifications: [
          {
            data: [
              { id: 'n1', data: { message: 'Please add your city' }, created_at: '2026-11-14' },
              { id: 'n2', data: { other: 1 }, created_at: '2026-11-13' },
              { id: 'n3', data: null, created_at: '2026-11-12' },
            ],
          },
        ],
      },
    });
    const r = await createManageMethods(client).infoRequests();
    expect(r).toEqual({
      ok: true,
      items: [{ id: 'n1', message: 'Please add your city', createdAt: '2026-11-14' }],
    });
    expect(q(made, 'notifications', 0).calls).toContainEqual({
      method: 'eq',
      args: ['kind', 'membership.info_requested'],
    });
    expect(q(made, 'notifications', 0).calls).toContainEqual({
      method: 'eq',
      args: ['member_id', M],
    });
  });

  it('maps an error to a friendly failure', async () => {
    const { client } = fakeClient({
      rpc: { data: M },
      tables: { notifications: [{ error: pgError('XX000', 'boom internal detail') }] },
    });
    const r = await createManageMethods(client).infoRequests();
    expect(r).toMatchObject({ ok: false, kind: 'unknown' });
    if (!r.ok) expect(r.message).not.toContain('boom');
  });
});

describe('manage api: giveAdultConsent', () => {
  const payload = { whatsapp_opt_in: false, email_updates_opt_in: true };

  it('sends the payload and returns the result', async () => {
    const { client, rpc } = fakeClient({
      rpc: { data: { member_id: M, consent_record_id: 'c1', privacy: {} } },
    });
    const r = await createManageMethods(client).giveAdultConsent(payload);
    expect(rpc).toHaveBeenCalledWith('give_adult_consent', { payload });
    expect(r).toEqual({ ok: true, member_id: M, consent_record_id: 'c1', privacy: {} });
  });

  it('maps 23514 (nothing due) and 42501 (signed out)', async () => {
    const a = fakeClient({ rpc: { error: pgError('23514', 'give_adult_consent: not due') } });
    expect(await createManageMethods(a.client).giveAdultConsent(payload)).toMatchObject({
      ok: false,
      kind: 'not_due',
    });
    const b = fakeClient({ rpc: { error: pgError('42501', 'give_adult_consent: sign in') } });
    expect(await createManageMethods(b.client).giveAdultConsent(payload)).toMatchObject({
      ok: false,
      kind: 'signed_out',
    });
  });
});

describe('manage api: updateProfile', () => {
  it('writes only whitelisted member columns and never touches email, dob or branch', async () => {
    const { client, made } = fakeClient({
      tables: {
        member_private: [{ data: { notify_prefs: {} } }, { data: [{ member_id: M }] }],
        members: [{ data: [{ id: M }] }],
      },
    });
    expect(await createManageMethods(client).updateProfile(INPUT)).toEqual({ ok: true });
    const memberUpdate = updateArg(q(made, 'members', 0));
    expect(Object.keys(memberUpdate).sort()).toEqual(
      ['city', 'education', 'full_name', 'gender', 'occupation', 'privacy'].sort(),
    );
    const privUpdate = updateArg(q(made, 'member_private', 1));
    expect(Object.keys(privUpdate).sort()).toEqual(
      ['emergency_contact_name', 'emergency_contact_phone', 'notify_prefs'].sort(),
    );
    expect(q(made, 'members', 0).calls).toContainEqual({ method: 'eq', args: ['id', M] });
    expect(q(made, 'member_private', 1).calls).toContainEqual({
      method: 'eq',
      args: ['member_id', M],
    });
  });

  it('merges notify_prefs over the stored value instead of replacing it', async () => {
    const { client, made } = fakeClient({
      tables: {
        member_private: [
          { data: { notify_prefs: { push: false, whatsapp: false, quiet_hours: '22-7' } } },
          { data: [{ member_id: M }] },
        ],
        members: [{ data: [{ id: M }] }],
      },
    });
    await createManageMethods(client).updateProfile(INPUT);
    expect(updateArg(q(made, 'member_private', 1)).notify_prefs).toEqual({
      push: false,
      quiet_hours: '22-7',
      whatsapp: true,
      email_updates: false,
    });
  });

  it('fails when the members update changes no row (RLS refuses silently), without writing private', async () => {
    const { client, from } = fakeClient({
      tables: { member_private: [{ data: { notify_prefs: {} } }], members: [{ data: [] }] },
    });
    const r = await createManageMethods(client).updateProfile(INPUT);
    expect(r).toMatchObject({ ok: false, kind: 'not_saved' });
    expect(from).toHaveBeenCalledTimes(2);
  });

  it('fails when the private update changes no row', async () => {
    const { client } = fakeClient({
      tables: {
        member_private: [{ data: { notify_prefs: {} } }, { data: [] }],
        members: [{ data: [{ id: M }] }],
      },
    });
    expect(await createManageMethods(client).updateProfile(INPUT)).toMatchObject({
      ok: false,
      kind: 'not_saved',
    });
  });

  it('fails without writing when the caller has no private row to read', async () => {
    const { client, from } = fakeClient({ tables: { member_private: [{ data: null }] } });
    expect(await createManageMethods(client).updateProfile(INPUT)).toMatchObject({
      ok: false,
      kind: 'not_saved',
    });
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('maps a check violation to invalid_input and a network error to offline', async () => {
    const a = fakeClient({
      tables: {
        member_private: [{ data: { notify_prefs: {} } }, { error: pgError('23514', 'check x') }],
        members: [{ data: [{ id: M }] }],
      },
    });
    const bad = await createManageMethods(a.client).updateProfile(INPUT);
    expect(bad).toMatchObject({ ok: false, kind: 'invalid_input' });
    if (!bad.ok) expect(bad.message).not.toContain('check x');
    const b = fakeClient({ tables: { member_private: [new TypeError('Failed to fetch')] } });
    expect(await createManageMethods(b.client).updateProfile(INPUT)).toMatchObject({
      ok: false,
      kind: 'offline',
    });
  });
});

describe('manage api: family', () => {
  it('lists dependents from my_dependents', async () => {
    const rows = [{ member_id: 'd1', full_name: 'Kabir Testwala', has_login: false }];
    const { client, rpc } = fakeClient({ rpc: { data: rows } });
    expect(await createManageMethods(client).myDependents()).toEqual({ ok: true, items: rows });
    expect(rpc).toHaveBeenCalledWith('my_dependents');
  });

  it('adds a dependent and maps refusals to friendly text', async () => {
    const payload = { full_name: 'Kabir Testwala', dob: '2012-05-01' };
    const ok = fakeClient({ rpc: { data: { member_id: 'd1', status: 'pending' } } });
    expect(await createManageMethods(ok.client).addDependent(payload)).toEqual({
      ok: true,
      member_id: 'd1',
      status: 'pending',
    });
    expect(ok.rpc).toHaveBeenCalledWith('add_dependent', { payload });

    const minorOnly = fakeClient({
      rpc: { error: pgError('42501', 'add_dependent: only an adult (18+) can add a dependent') },
    });
    expect(await createManageMethods(minorOnly.client).addDependent(payload)).toMatchObject({
      ok: false,
      kind: 'not_allowed',
    });
    const tooOld = fakeClient({
      rpc: { error: pgError('22023', 'add_dependent: a dependent must be under 18') },
    });
    const r = await createManageMethods(tooOld.client).addDependent(payload);
    expect(r).toMatchObject({ ok: false, kind: 'invalid_input' });
    if (!r.ok) expect(r.message).not.toMatch(/add_dependent|22023/);
  });

  it('creates a claim code and maps refusals', async () => {
    const ok = fakeClient({
      rpc: { data: { code: 'ABCD2345', expires_at: '2026-11-22T00:00:00Z' } },
    });
    expect(await createManageMethods(ok.client).createClaimCode('d1')).toEqual({
      ok: true,
      code: 'ABCD2345',
      expiresAt: '2026-11-22T00:00:00Z',
    });
    expect(ok.rpc).toHaveBeenCalledWith('create_claim_code', { dependent_id: 'd1' });

    const login = fakeClient({
      rpc: { error: pgError('23514', 'create_claim_code: the dependent already has a login') },
    });
    expect(await createManageMethods(login.client).createClaimCode('d1')).toMatchObject({
      ok: false,
      kind: 'not_allowed',
      message: 'This family member already has their own login.',
    });
    const off = fakeClient({ rpc: new TypeError('Network request failed') });
    expect(await createManageMethods(off.client).createClaimCode('d1')).toMatchObject({
      ok: false,
      kind: 'offline',
    });
  });
});
