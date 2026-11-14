import type { Client } from '../index';
import { createAdminApi } from './index';

function fakeClient(opts: {
  perms?: { permission_key: string; branch_id: string | null }[];
  stepUp?: boolean;
  assignments?: { starts_on: string; ends_on: string | null }[];
}): Client {
  const rpc = (name: string) =>
    Promise.resolve({
      error: null,
      data:
        name === 'my_permissions'
          ? (opts.perms ?? [])
          : name === 'has_step_up'
            ? (opts.stepUp ?? false)
            : 'member-1',
    });
  const from = () => ({
    select: () => ({
      eq: () => ({ eq: () => Promise.resolve({ error: null, data: opts.assignments ?? [] }) }),
    }),
  });
  return { rpc, from } as unknown as Client;
}

const NOW = new Date('2026-11-14T06:00:00Z');

describe('admin api getAccess', () => {
  it('needs a step-up for a current super admin without one', async () => {
    const api = createAdminApi(
      fakeClient({ assignments: [{ starts_on: '2026-01-01', ends_on: null }] }),
    );
    expect(await api.getAccess(NOW)).toEqual({ permissions: [], needsStepUp: true });
  });

  it('does not once the session holds a step-up', async () => {
    const api = createAdminApi(
      fakeClient({ stepUp: true, assignments: [{ starts_on: '2026-01-01', ends_on: null }] }),
    );
    expect((await api.getAccess(NOW)).needsStepUp).toBe(false);
  });

  it('does not for an ended or future super admin term, or a plain member', async () => {
    const ended = createAdminApi(
      fakeClient({ assignments: [{ starts_on: '2025-01-01', ends_on: '2026-11-13' }] }),
    );
    expect((await ended.getAccess(NOW)).needsStepUp).toBe(false);
    const future = createAdminApi(
      fakeClient({ assignments: [{ starts_on: '2026-12-01', ends_on: null }] }),
    );
    expect((await future.getAccess(NOW)).needsStepUp).toBe(false);
    expect((await createAdminApi(fakeClient({})).getAccess(NOW)).needsStepUp).toBe(false);
  });
});
