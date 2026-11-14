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

const MEMBER = 'a0000000-0000-4000-8000-000000000001';
const ASSIGNMENT = 'a0000000-0000-4000-8000-000000000002';
const BRANCH = 'c0000000-0000-4000-8000-00000000000a';

describe('admin api roles', () => {
  it('assignRole sends the member, role and branch to assign_role', async () => {
    const { client, rpcCalls } = fakeClient({});
    await createAdminApi(client).assignRole({
      memberId: MEMBER,
      roleKey: 'branch_president',
      branchId: BRANCH,
    });
    expect(rpcCalls).toEqual([
      {
        name: 'assign_role',
        args: { member_id: MEMBER, role_key: 'branch_president', branch_id: BRANCH },
      },
    ]);
  });

  it('assignRole omits the branch for a national role and passes dates when given', async () => {
    const { client, rpcCalls } = fakeClient({});
    await createAdminApi(client).assignRole({
      memberId: MEMBER,
      roleKey: 'national_secretary',
      branchId: null,
      startsOn: '2026-12-01',
      endsOn: '2027-11-30',
    });
    expect(rpcCalls[0]?.args).toEqual({
      member_id: MEMBER,
      role_key: 'national_secretary',
      starts_on: '2026-12-01',
      ends_on: '2027-11-30',
    });
  });

  it('assignRole throws the database error unchanged', async () => {
    const err = { code: '42501', message: 'assign_role: you cannot assign a role to yourself' };
    const { client } = fakeClient({ rpc: () => ({ data: null, error: err }) });
    await expect(
      createAdminApi(client).assignRole({ memberId: MEMBER, roleKey: 'x' }),
    ).rejects.toBe(err);
  });

  it('endRole calls end_role with the assignment id', async () => {
    const { client, rpcCalls } = fakeClient({});
    await createAdminApi(client).endRole(ASSIGNMENT);
    expect(rpcCalls).toEqual([{ name: 'end_role', args: { assignment_id: ASSIGNMENT } }]);
  });

  it('listRoleAssignments hides ended terms unless asked, using the IST date', async () => {
    const a = fakeClient({});
    // 2026-11-14 20:00 UTC is already 2026-11-15 in Kolkata.
    await createAdminApi(a.client).listRoleAssignments({ now: new Date('2026-11-14T20:00:00Z') });
    expect(called(a.queries[0] as Recorded, 'or')[0]?.args).toEqual([
      'ends_on.is.null,ends_on.gte.2026-11-15',
    ]);

    const b = fakeClient({});
    await createAdminApi(b.client).listRoleAssignments({ includeEnded: true });
    expect(called(b.queries[0] as Recorded, 'or')).toHaveLength(0);
  });
});

describe('admin api audit', () => {
  it('passes the actor, action and a whole-IST-day date range to the query', async () => {
    const { client, queries } = fakeClient({});
    await createAdminApi(client).listAuditLog({
      actorId: MEMBER,
      action: 'role',
      from: '2026-11-01',
      to: '2026-11-30',
      page: 2,
      pageSize: 10,
    });
    const q = queries[0] as Recorded;
    expect(q.table).toBe('audit_log');
    expect(called(q, 'eq')[0]?.args).toEqual(['actor_member_id', MEMBER]);
    expect(called(q, 'ilike')[0]?.args).toEqual(['action', '%role%']);
    expect(called(q, 'gte')[0]?.args).toEqual(['created_at', '2026-11-01T00:00:00+05:30']);
    expect(called(q, 'lt')[0]?.args).toEqual(['created_at', '2026-12-01T00:00:00+05:30']);
    expect(called(q, 'range')[0]?.args).toEqual([20, 29]);
  });

  it('applies no filters when none are given and ignores malformed dates', async () => {
    const { client, queries } = fakeClient({});
    await createAdminApi(client).listAuditLog({ from: '01/11/2026', to: 'x', action: '  ' });
    const q = queries[0] as Recorded;
    for (const m of ['eq', 'ilike', 'gte', 'lt']) expect(called(q, m)).toHaveLength(0);
    expect(called(q, 'range')[0]?.args).toEqual([0, 24]);
  });

  it('strips filter syntax from the action term', async () => {
    const { client, queries } = fakeClient({});
    await createAdminApi(client).listAuditLog({ action: 'a%,b(c)' });
    expect(called(queries[0] as Recorded, 'ilike')[0]?.args).toEqual(['action', '%a b c%']);
  });

  it('getMemberNames maps ids to names and skips the query for no ids', async () => {
    const a = fakeClient({});
    expect(await createAdminApi(a.client).getMemberNames([])).toEqual({});
    expect(a.queries).toHaveLength(0);

    const b = fakeClient({
      tables: { members: { data: [{ id: MEMBER, full_name: 'Fake Member' }], error: null } },
    });
    expect(await createAdminApi(b.client).getMemberNames([MEMBER, MEMBER])).toEqual({
      [MEMBER]: 'Fake Member',
    });
    expect(called(b.queries[0] as Recorded, 'in')[0]?.args).toEqual(['id', [MEMBER]]);
  });
});

describe('admin api settings', () => {
  it('listSettings returns the rows from admin_list_settings', async () => {
    const rows = [{ key: 'a', value: null, is_secret: true, editable: false }];
    const { client, rpcCalls } = fakeClient({ rpc: () => ({ data: rows, error: null }) });
    expect(await createAdminApi(client).listSettings()).toEqual(rows);
    expect(rpcCalls[0]?.name).toBe('admin_list_settings');
  });

  it('setSetting sends the value as JSON, not a string', async () => {
    const { client, rpcCalls } = fakeClient({});
    await createAdminApi(client).setSetting('registration_open', true);
    expect(rpcCalls[0]).toEqual({
      name: 'admin_set_setting',
      args: { key: 'registration_open', value: true },
    });
  });

  it('setSetting throws the database error', async () => {
    const err = {
      code: '42501',
      message: 'admin_set_setting: secret settings cannot be changed here',
    };
    const { client } = fakeClient({ rpc: () => ({ data: null, error: err }) });
    await expect(createAdminApi(client).setSetting('x_key', 'v')).rejects.toBe(err);
  });
});
