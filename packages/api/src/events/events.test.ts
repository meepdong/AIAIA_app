import type { Client } from '../index';
import { createApi } from '../index';
import { createEventsApi } from './index';

type Result = { data: unknown; error: { message: string } | null };

/** Chainable stand-in for a PostgREST query: records every call, resolves when awaited. */
function chain(result: Result, calls: [string, unknown[]][]) {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (res: (r: Result) => unknown, rej: (e: unknown) => unknown) =>
            Promise.resolve(result).then(res, rej);
        }
        return (...args: unknown[]) => {
          calls.push([prop, args]);
          return proxy;
        };
      },
    },
  );
  return proxy;
}

function fakeClient(opts: { rpc?: Record<string, Result>; from?: Record<string, Result> }) {
  const calls: [string, unknown[]][] = [];
  const rpc = jest.fn((name: string, args?: unknown) => {
    calls.push([`rpc:${name}`, [args]]);
    return Promise.resolve(opts.rpc?.[name] ?? { data: null, error: null });
  });
  const from = jest.fn((table: string) => {
    calls.push([`from:${table}`, []]);
    return chain(opts.from?.[table] ?? { data: [], error: null }, calls);
  });
  return { client: { rpc, from } as unknown as Client, rpc, from, calls };
}

const EVENT = '00000000-0000-4000-8000-0000000000e1';
const ME = '00000000-0000-4000-8000-0000000000a1';
const KID = '00000000-0000-4000-8000-0000000000a2';

describe('createEventsApi', () => {
  it('is registered on createApi', () => {
    const { client } = fakeClient({});
    expect(createApi(client).events.rsvp).toEqual(expect.any(Function));
  });

  it('rsvp sends the member it was given, not the caller', async () => {
    const { client, rpc } = fakeClient({ rpc: { rsvp: { data: 'waitlisted', error: null } } });
    const status = await createEventsApi(client).rsvp(EVENT, KID, 'going');
    expect(status).toBe('waitlisted');
    expect(rpc).toHaveBeenCalledWith('rsvp', { event_id: EVENT, member_id: KID, status: 'going' });
  });

  it('rsvp defaults to going and can cancel', async () => {
    const { client, rpc } = fakeClient({ rpc: { rsvp: { data: 'cancelled', error: null } } });
    const api = createEventsApi(client);
    await api.rsvp(EVENT, ME);
    expect(rpc).toHaveBeenLastCalledWith('rsvp', {
      event_id: EVENT,
      member_id: ME,
      status: 'going',
    });
    expect(await api.rsvp(EVENT, ME, 'cancelled')).toBe('cancelled');
  });

  it('throws the server message when an RPC fails', async () => {
    const { client } = fakeClient({
      rpc: { rsvp: { data: null, error: { message: 'registration is not open' } } },
    });
    await expect(createEventsApi(client).rsvp(EVENT, ME)).rejects.toThrow(
      'registration is not open',
    );
  });

  it('spots skips the call for an empty list and passes ids otherwise', async () => {
    const rows = [{ event_id: EVENT, going: 3, waitlisted: 1 }];
    const { client, rpc } = fakeClient({ rpc: { event_spots: { data: rows, error: null } } });
    const api = createEventsApi(client);
    expect(await api.spots([])).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
    expect(await api.spots([EVENT])).toEqual(rows);
    expect(rpc).toHaveBeenCalledWith('event_spots', { event_ids: [EVENT] });
  });

  it('listEvents upcoming: not ended, soonest first, wing includes events for everyone', async () => {
    const { client, calls } = fakeClient({});
    await createEventsApi(client).listEvents({
      when: 'upcoming',
      scope: 'national',
      wing: 'youth',
    });
    const names = calls.map(([n]) => n);
    expect(names).toContain('gte');
    expect(names).not.toContain('lt');
    expect(calls).toContainEqual(['eq', ['scope', 'national']]);
    expect(calls).toContainEqual(['in', ['audience', ['youth', 'all']]]);
    expect(calls).toContainEqual(['in', ['status', ['published', 'cancelled']]]);
    expect(calls).toContainEqual(['order', ['starts_at', { ascending: true }]]);
  });

  it('listEvents past: ended, latest first, no filters by default', async () => {
    const { client, calls } = fakeClient({});
    await createEventsApi(client).listEvents({ when: 'past' });
    const names = calls.map(([n]) => n);
    expect(names).toContain('lt');
    expect(names).not.toContain('gte');
    expect(calls.some(([n, a]) => n === 'eq' && a[0] === 'scope')).toBe(false);
    expect(calls.some(([n, a]) => n === 'in' && a[0] === 'audience')).toBe(false);
    expect(calls).toContainEqual(['order', ['starts_at', { ascending: false }]]);
  });

  it('rsvpsFor reads rsvps for the given members and skips an empty list', async () => {
    const { client, calls } = fakeClient({});
    const api = createEventsApi(client);
    expect(await api.rsvpsFor([])).toEqual([]);
    await api.rsvpsFor([ME, KID], [EVENT]);
    expect(calls).toContainEqual(['from:rsvps', []]);
    expect(calls).toContainEqual(['in', ['member_id', [ME, KID]]]);
    expect(calls).toContainEqual(['in', ['event_id', [EVENT]]]);
  });

  it('myMember is null with no member id, else reads the members row', async () => {
    const none = fakeClient({ rpc: { current_member_id: { data: null, error: null } } });
    expect(await createEventsApi(none.client).myMember()).toBeNull();
    const row = { id: ME, branch_id: 'b1', wing: 'youth', full_name: 'Asha Demokar' };
    const some = fakeClient({
      rpc: { current_member_id: { data: ME, error: null } },
      from: { members: { data: row, error: null } },
    });
    expect(await createEventsApi(some.client).myMember()).toEqual(row);
  });

  it('wraps duties, dependents and the officer RPCs', async () => {
    const { client, rpc } = fakeClient({
      rpc: {
        my_event_duties: { data: [{ event_id: EVENT }], error: null },
        my_dependents: { data: [{ member_id: KID }], error: null },
        remove_event_staff: { data: true, error: null },
      },
    });
    const api = createEventsApi(client);
    expect(await api.myDuties()).toEqual([{ event_id: EVENT }]);
    expect(await api.myDependents()).toEqual([{ member_id: KID }]);
    await api.attendees(EVENT);
    await api.team(EVENT);
    await api.setStaff(EVENT, ME, ['check_in']);
    expect(await api.removeStaff(EVENT, ME)).toBe(true);
    expect(rpc).toHaveBeenCalledWith('event_attendees', { event_id: EVENT });
    expect(rpc).toHaveBeenCalledWith('event_team', { event_id: EVENT });
    expect(rpc).toHaveBeenCalledWith('set_event_staff', {
      event_id: EVENT,
      member_id: ME,
      capabilities: ['check_in'],
    });
  });
});
