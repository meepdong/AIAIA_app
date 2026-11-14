import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { buildIcs, googleCalendarUrl } from './calendar';
import { EventDetail } from './EventDetail';
import { EventsList } from './EventsList';
import { MyDuties } from './MyDuties';
import { registrationState, safeMapUrl, spotsLeft, spotsText } from './helpers';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

const EVENT = '00000000-0000-4000-8000-0000000000e1';
const ME = '00000000-0000-4000-8000-0000000000a1';
const KID = '00000000-0000-4000-8000-0000000000a2';
const BRANCH = '00000000-0000-4000-8000-0000000000b1';

type Row = Record<string, unknown>;
type World = {
  capacity: number | null;
  going: number;
  waitlisted: number;
  rsvps: Row[];
  duties: Row[];
};

let world: World;
const rpcCalls: [string, Record<string, unknown> | undefined][] = [];

function event(over: Row = {}): Row {
  const future = Date.now() + 7 * 24 * 3600 * 1000;
  return {
    id: EVENT,
    title: 'Demo Youth Meetup',
    description: 'A fake event.',
    scope: 'national',
    branch_id: null,
    audience: 'all',
    status: 'published',
    capacity: world.capacity,
    starts_at: new Date(future).toISOString(),
    ends_at: new Date(future + 3600 * 1000).toISOString(),
    registration_opens_at: null,
    registration_closes_at: null,
    venue_name: 'Placeholder Hall',
    venue_address: '1 Example Road',
    map_url: 'https://maps.example.com/hall',
    ...over,
  };
}

function rsvp(memberId: string, status: string): Row {
  return { event_id: EVENT, member_id: memberId, status };
}

/** A chainable stand-in for a PostgREST query. Filters are ignored: each table returns its fixture. */
function query(table: string) {
  let single = false;
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (res: (r: unknown) => unknown, rej: (e: unknown) => unknown) => {
            const rows: Row[] =
              table === 'events'
                ? [event()]
                : table === 'rsvps'
                  ? world.rsvps
                  : table === 'members'
                    ? [{ id: ME, branch_id: BRANCH, wing: 'youth', full_name: 'Asha Demokar' }]
                    : [];
            const data = single ? (rows[0] ?? null) : rows;
            return Promise.resolve({ data, error: null }).then(res, rej);
          };
        }
        return (...args: unknown[]) => {
          if (prop === 'maybeSingle') single = true;
          void args;
          return proxy;
        };
      },
    },
  );
  return proxy;
}

const mockClient = {
  from: (table: string) => query(table),
  rpc: (name: string, args?: Record<string, unknown>) => {
    rpcCalls.push([name, args]);
    switch (name) {
      case 'current_member_id':
        return Promise.resolve({ data: ME, error: null });
      case 'my_dependents':
        return Promise.resolve({
          data: [
            { member_id: KID, full_name: 'Kabir Placeholder', status: 'active' },
            { member_id: 'x', full_name: 'Tara Fixture', status: 'pending' },
          ],
          error: null,
        });
      case 'event_spots':
        return Promise.resolve({
          data: [{ event_id: EVENT, going: world.going, waitlisted: world.waitlisted }],
          error: null,
        });
      case 'my_event_duties':
        return Promise.resolve({ data: world.duties, error: null });
      case 'rsvp': {
        const memberId = args?.member_id as string;
        const wanted = args?.status as string;
        const full = world.capacity != null && world.going >= world.capacity;
        const result = wanted === 'cancelled' ? 'cancelled' : full ? 'waitlisted' : 'going';
        world.rsvps = [
          ...world.rsvps.filter((r) => r.member_id !== memberId),
          rsvp(memberId, result),
        ];
        return Promise.resolve({ data: result, error: null });
      }
      default:
        return Promise.resolve({ data: null, error: { message: `unexpected rpc ${name}` } });
    }
  },
};
jest.mock('@/lib/supabase', () => ({ getSupabase: () => mockClient }));

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 800 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  world = { capacity: 10, going: 4, waitlisted: 0, rsvps: [], duties: [] };
  rpcCalls.length = 0;
});

const rsvpCalls = () => rpcCalls.filter(([n]) => n === 'rsvp').map(([, a]) => a);

describe('RSVP on the event detail', () => {
  it('self: going', async () => {
    await render(wrap(<EventDetail eventId={EVENT} />));
    await fireEvent.press(await screen.findByRole('button', { name: 'RSVP for Asha Demokar' }));
    expect(await screen.findByText('Going')).toBeTruthy();
    expect(rsvpCalls()).toEqual([{ event_id: EVENT, member_id: ME, status: 'going' }]);
  });

  it('self: waitlisted when the event is full', async () => {
    world.going = 10;
    await render(wrap(<EventDetail eventId={EVENT} />));
    await fireEvent.press(await screen.findByRole('button', { name: 'RSVP for Asha Demokar' }));
    expect(await screen.findByText('Waitlisted')).toBeTruthy();
  });

  it('self: cancelled, and can RSVP again', async () => {
    world.rsvps = [rsvp(ME, 'going')];
    await render(wrap(<EventDetail eventId={EVENT} />));
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Cancel RSVP for Asha Demokar' }),
    );
    expect(await screen.findByText('Cancelled')).toBeTruthy();
    expect(rsvpCalls()).toEqual([{ event_id: EVENT, member_id: ME, status: 'cancelled' }]);
    expect(await screen.findByText('RSVP again')).toBeTruthy();
  });

  it('dependent: going, sent for the dependent and not the caller', async () => {
    await render(wrap(<EventDetail eventId={EVENT} />));
    await fireEvent.press(
      await screen.findByRole('button', { name: 'RSVP for Kabir Placeholder' }),
    );
    await waitFor(() => expect(rsvpCalls()).toHaveLength(1));
    expect(rsvpCalls()[0]).toEqual({ event_id: EVENT, member_id: KID, status: 'going' });
    expect(await screen.findByText('Going')).toBeTruthy();
    // The caller's own row is untouched.
    expect(screen.getByRole('button', { name: 'RSVP for Asha Demokar' })).toBeTruthy();
  });

  it('dependent: waitlisted when the event is full', async () => {
    world.going = 10;
    await render(wrap(<EventDetail eventId={EVENT} />));
    await fireEvent.press(
      await screen.findByRole('button', { name: 'RSVP for Kabir Placeholder' }),
    );
    expect(await screen.findByText('Waitlisted')).toBeTruthy();
    expect(rsvpCalls()[0]).toMatchObject({ member_id: KID });
  });

  it('dependent: cancelled', async () => {
    world.rsvps = [rsvp(ME, 'going'), rsvp(KID, 'waitlisted')];
    await render(wrap(<EventDetail eventId={EVENT} />));
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Cancel RSVP for Kabir Placeholder' }),
    );
    expect(await screen.findByText('Cancelled')).toBeTruthy();
    expect(rsvpCalls()).toEqual([{ event_id: EVENT, member_id: KID, status: 'cancelled' }]);
    // Self is still going.
    expect(screen.getByRole('button', { name: 'Cancel RSVP for Asha Demokar' })).toBeTruthy();
  });

  it('does not offer RSVP for a dependent who is not active', async () => {
    await render(wrap(<EventDetail eventId={EVENT} />));
    await screen.findByRole('button', { name: 'RSVP for Kabir Placeholder' });
    expect(screen.queryByText('Tara Fixture')).toBeNull();
  });
});

describe('spots left', () => {
  it('shows capacity minus going', async () => {
    await render(wrap(<EventDetail eventId={EVENT} />));
    expect(await screen.findByText('6 spots left of 10')).toBeTruthy();
  });

  it('shows a full event with its waitlist', async () => {
    world.going = 10;
    world.waitlisted = 3;
    await render(wrap(<EventDetail eventId={EVENT} />));
    expect(await screen.findByText('Full, 3 on the waitlist')).toBeTruthy();
  });

  it('shows no limit when capacity is null', async () => {
    world.capacity = null;
    await render(wrap(<EventDetail eventId={EVENT} />));
    expect(await screen.findByText('Open to everyone, no spot limit')).toBeTruthy();
  });

  it('helpers', () => {
    expect(spotsLeft(10, 4)).toBe(6);
    expect(spotsLeft(10, 12)).toBe(0);
    expect(spotsLeft(null, 5)).toBeNull();
    expect(spotsText(1, { going: 0, waitlisted: 0 })).toBe('1 spot left of 1');
  });
});

describe('list and duties', () => {
  it('cards show the RSVP status for the caller and each dependent', async () => {
    world.rsvps = [rsvp(ME, 'going'), rsvp(KID, 'waitlisted')];
    await render(wrap(<EventsList />));
    expect(await screen.findByText('Demo Youth Meetup')).toBeTruthy();
    expect(await screen.findByText('Going')).toBeTruthy();
    expect(await screen.findByText('Kabir: Waitlisted')).toBeTruthy();
  });

  it('offers the national, my-branch and wing filters', async () => {
    await render(wrap(<EventsList />));
    for (const name of ['Upcoming', 'Past', 'National', 'My branch', 'Youth', 'AIAIA']) {
      expect(await screen.findByRole('button', { name })).toBeTruthy();
    }
  });

  it('lists my event duties with the capabilities', async () => {
    world.duties = [
      {
        event_id: EVENT,
        title: 'Demo Youth Meetup',
        venue_name: 'Placeholder Hall',
        starts_at: '2026-12-01T04:30:00Z',
        ends_at: '2026-12-01T08:30:00Z',
        capabilities: ['check_in', 'safety_lead'],
      },
    ];
    await render(wrap(<MyDuties />));
    expect(await screen.findByText(/Check-in, Safety lead/)).toBeTruthy();
  });
});

describe('detail helpers', () => {
  it('only opens http(s) map links and falls back to a venue search', () => {
    const base = { venue_name: 'Placeholder Hall', venue_address: null };
    expect(safeMapUrl({ ...base, map_url: 'https://maps.example.com/x' })).toBe(
      'https://maps.example.com/x',
    );
    expect(safeMapUrl({ ...base, map_url: 'javascript:alert(1)' })).toContain(
      'google.com/maps/search',
    );
    expect(safeMapUrl({ venue_name: null, venue_address: null, map_url: null })).toBeNull();
  });

  it('builds an .ics with escaped text and UTC times', () => {
    const ics = buildIcs(
      {
        id: EVENT,
        title: 'Meet, greet; learn',
        description: 'Line one\nLine two',
        starts_at: '2026-12-01T04:30:00Z',
        ends_at: '2026-12-01T06:00:00Z',
        venue_name: 'Placeholder Hall',
        venue_address: null,
      },
      new Date('2026-11-14T00:00:00Z'),
    );
    expect(ics).toContain('DTSTART:20261201T043000Z');
    expect(ics).toContain('DTEND:20261201T060000Z');
    expect(ics).toContain('SUMMARY:Meet\\, greet\\; learn');
    expect(ics).toContain('DESCRIPTION:Line one\\nLine two');
    expect(ics).toContain('LOCATION:Placeholder Hall');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(
      googleCalendarUrl({
        id: EVENT,
        title: 'X',
        description: null,
        starts_at: '2026-12-01T04:30:00Z',
        ends_at: '2026-12-01T06:00:00Z',
        venue_name: null,
        venue_address: null,
      }),
    ).toContain('dates=20261201T043000Z%2F20261201T060000Z');
  });

  it('registration state', () => {
    const e = event() as never;
    expect(registrationState(e)).toBe('open');
    expect(registrationState(event({ status: 'cancelled' }) as never)).toBe('cancelled');
    expect(
      registrationState(event({ registration_opens_at: '2999-01-01T00:00:00Z' }) as never),
    ).toBe('not_yet');
    expect(
      registrationState(event({ registration_closes_at: '2000-01-01T00:00:00Z' }) as never),
    ).toBe('closed');
  });
});
