import type { Client } from '../index';
import { createDirectoryApi } from './index';

function fakeClient(result: { data: unknown; error: unknown }) {
  const rpc = jest.fn().mockResolvedValue(result);
  const order = jest.fn().mockResolvedValue(result);
  const select = jest.fn().mockReturnValue({ order });
  const from = jest.fn().mockReturnValue({ select });
  return { client: { rpc, from } as unknown as Client, rpc, from, select, order };
}

describe('directory api', () => {
  it('search passes the trimmed query, branch and page to search_directory', async () => {
    const { client, rpc } = fakeClient({ data: [], error: null });
    await createDirectoryApi(client).search({ q: '  zoya ', branch_id: 'b1', page: 2 });
    expect(rpc).toHaveBeenCalledWith('search_directory', { q: 'zoya', branch_id: 'b1', page: 2 });
  });

  it('search omits an empty query and branch, and defaults to page 1', async () => {
    const { client, rpc } = fakeClient({ data: null, error: null });
    const rows = await createDirectoryApi(client).search({ q: '   ', branch_id: null });
    expect(rpc).toHaveBeenCalledWith('search_directory', { page: 1 });
    expect(rows).toEqual([]);
  });

  it('search throws the RPC error', async () => {
    const { client } = fakeClient({ data: null, error: new Error('boom') });
    await expect(createDirectoryApi(client).search({})).rejects.toThrow('boom');
  });

  it('branches reads the branch list ordered by name', async () => {
    const { client, from, select, order } = fakeClient({
      data: [{ id: 'b1', name: 'A' }],
      error: null,
    });
    await expect(createDirectoryApi(client).branches()).resolves.toEqual([{ id: 'b1', name: 'A' }]);
    expect(from).toHaveBeenCalledWith('branches');
    expect(select).toHaveBeenCalledWith('id, name');
    expect(order).toHaveBeenCalledWith('name');
  });

  it('reportMember files a member report', async () => {
    const { client, rpc } = fakeClient({ data: 'r1', error: null });
    await expect(createDirectoryApi(client).reportMember('m1', 'spam', ' hi ')).resolves.toBe('r1');
    expect(rpc).toHaveBeenCalledWith('submit_report', {
      target_type: 'member',
      target_id: 'm1',
      reason: 'spam',
      details: 'hi',
    });
  });
});
