import type { Client } from '../index';
import { createAdminApi } from './index';

type Call = { method: string; args: unknown[] };
type Recorded = { table: string; calls: Call[] };

/** A chainable, awaitable query stub: every builder method returns itself and records its call. */
function chain(result: unknown, rec: Recorded): unknown {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => unknown) => resolve(result);
        }
        return (...args: unknown[]) => {
          rec.calls.push({ method: prop, args });
          return proxy;
        };
      },
    },
  );
  return proxy;
}

function fakeClient(opts: {
  tables?: Record<string, unknown>;
  rpc?: (name: string, args: Record<string, unknown>) => unknown;
}) {
  const queries: Recorded[] = [];
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const client = {
    from: (table: string) => {
      const rec: Recorded = { table, calls: [] };
      queries.push(rec);
      return chain(opts.tables?.[table] ?? { data: [], error: null, count: 0 }, rec);
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return Promise.resolve(opts.rpc?.(name, args) ?? { data: null, error: null });
    },
  } as unknown as Client;
  return { client, queries, rpcCalls };
}

const called = (q: Recorded, method: string) => q.calls.filter((c) => c.method === method);

describe('admin api getDashboard', () => {
  it('does not query reports without reports.review', async () => {
    const { client, queries } = fakeClient({});
    const data = await createAdminApi(client).getDashboard({ canReviewReports: false });
    expect(data.openReports).toBeNull();
    expect(queries.some((q) => q.table === 'reports')).toBe(false);
  });

  it('counts open reports when the caller may review them', async () => {
    const { client, queries } = fakeClient({
      tables: { reports: { count: 4, error: null, data: null } },
    });
    const data = await createAdminApi(client).getDashboard({ canReviewReports: true });
    expect(data.openReports).toBe(4);
    const reports = queries.find((q) => q.table === 'reports');
    expect(called(reports!, 'eq')[0]?.args).toEqual(['status', 'open']);
  });

  it('asks for published events that start after now', async () => {
    const now = new Date('2026-11-14T06:00:00Z');
    const { client, queries } = fakeClient({});
    await createAdminApi(client).getDashboard({ canReviewReports: false, now });
    const events = queries.find((q) => q.table === 'events')!;
    expect(called(events, 'eq')[0]?.args).toEqual(['status', 'published']);
    expect(called(events, 'gt')[0]?.args).toEqual(['starts_at', now.toISOString()]);
  });

  it('reports pending members and drops branches with no active members', async () => {
    const { client } = fakeClient({
      tables: {
        // Every head count resolves to 3; branches resolve to rows.
        members: { count: 3, error: null, data: null },
        branches: {
          data: [{ id: 'b1', code: 'AAA', name: 'Branch A' }],
          error: null,
        },
      },
    });
    const data = await createAdminApi(client).getDashboard({ canReviewReports: false });
    expect(data.pending).toBe(3);
    expect(data.byWing).toEqual({ youth: 3, aiaia: 3 });
    expect(data.byBranch).toEqual([{ branchId: 'b1', code: 'AAA', name: 'Branch A', active: 3 }]);
  });
});

describe('admin api listMembers', () => {
  it('pages with range()', async () => {
    const { client, queries } = fakeClient({
      tables: { members: { data: [], error: null, count: 60 } },
    });
    const page = await createAdminApi(client).listMembers({ page: 2, pageSize: 25 });
    expect(page.total).toBe(60);
    expect(called(queries[0]!, 'range')[0]?.args).toEqual([50, 74]);
  });

  it('applies search and filters, with the search term cleaned', async () => {
    const { client, queries } = fakeClient({});
    await createAdminApi(client).listMembers({
      search: ' Asha,(x)% ',
      status: 'pending',
      branchId: 'b1',
      wing: 'youth',
    });
    const q = queries[0]!;
    expect(called(q, 'or')[0]?.args).toEqual(['full_name.ilike.%Asha x%,member_no.ilike.%Asha x%']);
    expect(called(q, 'eq').map((c) => c.args)).toEqual([
      ['status', 'pending'],
      ['branch_id', 'b1'],
      ['wing', 'youth'],
    ]);
  });

  it('sends no search clause for a blank term', async () => {
    const { client, queries } = fakeClient({});
    await createAdminApi(client).listMembers({ search: '  ' });
    expect(called(queries[0]!, 'or')).toHaveLength(0);
  });

  it('throws the database error', async () => {
    const { client } = fakeClient({
      tables: { members: { data: null, error: new Error('denied'), count: null } },
    });
    await expect(createAdminApi(client).listMembers()).rejects.toThrow('denied');
  });
});

describe('admin api setMemberBranch', () => {
  it('calls the RPC with the member and the new branch', async () => {
    const { client, rpcCalls } = fakeClient({});
    await createAdminApi(client).setMemberBranch('m1', 'b2');
    expect(rpcCalls).toEqual([
      { name: 'admin_set_member_branch', args: { member_id: 'm1', to_branch_id: 'b2' } },
    ]);
  });

  it('surfaces a refusal', async () => {
    const { client } = fakeClient({
      rpc: () => ({ data: null, error: { code: '42501', message: 'nope' } }),
    });
    await expect(createAdminApi(client).setMemberBranch('m1', 'b2')).rejects.toMatchObject({
      code: '42501',
    });
  });
});

describe('admin api exportMembers', () => {
  const row = (n: number) => ({ member_id: `id-${String(n).padStart(3, '0')}` });
  const ALL = Array.from({ length: 5 }, (_, i) => row(i + 1));

  /** Serves ALL in pages by the `after` cursor; throws on any call beyond the expected last one. */
  const pagedRpc = (maxCalls: number) => {
    let calls = 0;
    return (_name: string, args: Record<string, unknown>) => {
      calls += 1;
      if (calls > maxCalls) return { data: null, error: new Error('unexpected extra page') };
      const size = args.page_size as number;
      const from = args.after ? ALL.findIndex((r) => r.member_id === args.after) + 1 : 0;
      return { data: ALL.slice(from, from + size), error: null };
    };
  };

  it('pages until a short page and stops, using the last member_id as the cursor', async () => {
    const { client, rpcCalls } = fakeClient({ rpc: pagedRpc(2) });
    const rows = await createAdminApi(client).exportMembers({ branchId: null, pageSize: 3 });
    expect(rows.map((r) => r.member_id)).toEqual(ALL.map((r) => r.member_id));
    expect(rpcCalls).toHaveLength(2);
    expect(rpcCalls[0]?.args).toEqual({ page_size: 3 });
    expect(rpcCalls[1]?.args).toEqual({ page_size: 3, after: 'id-003' });
  });

  it('asks for a further page after an exactly full page, which then comes back short', async () => {
    const { client, rpcCalls } = fakeClient({ rpc: pagedRpc(2) });
    const rows = await createAdminApi(client).exportMembers({ branchId: 'b1', pageSize: 5 });
    expect(rows).toHaveLength(5);
    expect(rpcCalls).toHaveLength(2);
    expect(rpcCalls[0]?.args).toEqual({ page_size: 5, branch_id: 'b1' });
    expect(rpcCalls[1]?.args).toEqual({ page_size: 5, branch_id: 'b1', after: 'id-005' });
  });

  it('propagates a refusal', async () => {
    const { client } = fakeClient({
      rpc: () => ({ data: null, error: { code: '42501', message: 'no' } }),
    });
    await expect(
      createAdminApi(client).exportMembers({ branchId: null, pageSize: 3 }),
    ).rejects.toMatchObject({ code: '42501' });
  });
});
