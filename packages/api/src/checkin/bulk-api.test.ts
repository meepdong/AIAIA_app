import type { Client } from '../index';
import { createCheckinApi, PassError } from './index';

const PASS = {
  member_id: '11111111-1111-4111-8111-111111111111',
  full_name: 'Asha Fake',
  branch_name: 'Test Branch',
  pass_version: 2,
  qr: 'AIAIA1.x.2.y',
};

function api(result: { data?: unknown; error?: unknown }) {
  const invoke = jest.fn(() =>
    Promise.resolve({ data: result.data ?? null, error: result.error ?? null }),
  );
  const client = { functions: { invoke } } as unknown as Client;
  return { checkin: createCheckinApi(client), invoke };
}

const httpError = (status: number) => ({ name: 'FunctionsHttpError', context: { status } });

describe('checkin bulkPasses', () => {
  it('sends only the scope to member-pass and returns the signed passes', async () => {
    const { checkin, invoke } = api({ data: { passes: [PASS] } });
    await expect(checkin.bulkPasses({ event_id: 'e1' })).resolves.toEqual([PASS]);
    expect(invoke).toHaveBeenCalledWith('member-pass', {
      method: 'POST',
      body: { scope: { event_id: 'e1' } },
    });
  });

  it.each([
    [403, 'not_allowed'],
    [413, 'too_many'],
    [503, 'not_configured'],
    [500, 'failed'],
  ])('maps HTTP %i to %s', async (status, code) => {
    const { checkin } = api({ error: httpError(status) });
    await expect(checkin.bulkPasses({ branch_id: 'b1' })).rejects.toEqual(
      new PassError(code as never),
    );
  });

  it('a network failure is offline, and a malformed reply is failed', async () => {
    await expect(
      api({ error: { name: 'FunctionsFetchError' } }).checkin.bulkPasses({ branch_id: 'b1' }),
    ).rejects.toMatchObject({ code: 'offline' });
    await expect(
      api({ data: { passes: [{ member_id: 1 }] } }).checkin.bulkPasses({ branch_id: 'b1' }),
    ).rejects.toMatchObject({ code: 'failed' });
  });
});
