import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AdminEventDetail } from './AdminEventDetail';
import { ATTENDEE_COLUMNS, attendeeCounts, attendeesCsv } from './csv';
import { EMPTY_FORM, parseIst, validateEventForm, type EventFormValues } from './form';
import { lifecycleActions } from './lifecycle';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
}));

const EVENT = '00000000-0000-4000-8000-0000000000e1';
const KID = '00000000-0000-4000-8000-0000000000a2';
const BRANCH = '00000000-0000-4000-8000-0000000000b1';

type Row = Record<string, unknown>;
let status: string;
let updates: Row[];
const rpcCalls: [string, Record<string, unknown> | undefined][] = [];

function eventRow(): Row {
  const now = Date.now();
  return {
    id: EVENT,
    title: 'Demo Youth Meetup',
    description: null,
    scope: 'national',
    branch_id: null,
    audience: 'all',
    status,
    capacity: 10,
    starts_at: new Date(now + 7 * 24 * 3600 * 1000).toISOString(),
    ends_at: new Date(now + 7 * 24 * 3600 * 1000 + 3600 * 1000).toISOString(),
    registration_opens_at: null,
    registration_closes_at: null,
    venue_name: null,
    venue_address: null,
    map_url: null,
  };
}

function query(table: string) {
  let single = false;
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (res: (r: unknown) => unknown, rej: (e: unknown) => unknown) => {
            const rows: Row[] = table === 'events' ? [eventRow()] : [];
            return Promise.resolve({ data: single ? (rows[0] ?? null) : rows, error: null }).then(
              res,
              rej,
            );
          };
        }
        return (...args: unknown[]) => {
          if (prop === 'maybeSingle' || prop === 'single') single = true;
          if (prop === 'update') updates.push(args[0] as Row);
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
    const data =
      name === 'search_directory'
        ? [
            {
              id: KID,
              full_name: 'Kabir Placeholder',
              branch_name: 'Demo Branch',
              phone: '+91 90000 00001',
              email: null,
            },
          ]
        : name === 'set_event_staff'
          ? null
          : [];
    return Promise.resolve({ data, error: null });
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
  status = 'draft';
  updates = [];
  rpcCalls.length = 0;
});

const GOOD: EventFormValues = {
  ...EMPTY_FORM,
  title: 'Demo Meetup',
  startsAt: '2026-12-01 18:00',
  endsAt: '2026-12-01 20:00',
};

function errorsOf(over: Partial<EventFormValues>) {
  const r = validateEventForm({ ...GOOD, ...over });
  return r.ok ? {} : r.errors;
}

describe('event form validation', () => {
  it('accepts a valid form and reads times as Asia/Kolkata', () => {
    const r = validateEventForm(GOOD);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.input.starts_at).toBe('2026-12-01T12:30:00.000Z');
      expect(r.input.branch_id).toBeNull();
      expect(r.input.capacity).toBeNull();
    }
  });

  it('requires the event to end after it starts', () => {
    expect(errorsOf({ endsAt: '2026-12-01 17:00' }).endsAt).toMatch(/end after/);
    expect(errorsOf({ endsAt: '2026-12-01 18:00' }).endsAt).toMatch(/end after/);
  });

  it('requires registration to close at or before the start', () => {
    expect(errorsOf({ registrationClosesAt: '2026-12-01 18:01' }).registrationClosesAt).toMatch(
      /before the event starts/,
    );
    expect(
      errorsOf({ registrationClosesAt: '2026-12-01 18:00' }).registrationClosesAt,
    ).toBeUndefined();
  });

  it('requires a branch for a branch event, and drops it for a national one', () => {
    expect(errorsOf({ scope: 'branch' }).branchId).toMatch(/branch/);
    const r = validateEventForm({ ...GOOD, scope: 'branch', branchId: BRANCH });
    expect(r.ok && r.input.branch_id).toBe(BRANCH);
    const n = validateEventForm({ ...GOOD, scope: 'national', branchId: BRANCH });
    expect(n.ok && n.input.branch_id).toBeNull();
  });

  it('accepts only https map links', () => {
    expect(errorsOf({ mapUrl: 'javascript:alert(1)' }).mapUrl).toBeTruthy();
    expect(errorsOf({ mapUrl: 'http://maps.example.com/x' }).mapUrl).toBeTruthy();
    expect(errorsOf({ mapUrl: 'https://maps.example.com/x' }).mapUrl).toBeUndefined();
  });

  it('checks title, capacity and real dates', () => {
    expect(errorsOf({ title: '  ' }).title).toBeTruthy();
    expect(errorsOf({ capacity: '0' }).capacity).toBeTruthy();
    expect(errorsOf({ capacity: '12' }).capacity).toBeUndefined();
    expect(parseIst('2026-02-30 10:00')).toBeNull();
  });
});

describe('lifecycle', () => {
  it('offers publish for a draft and cancel for a published event', () => {
    const soon = { starts_at: '2099-01-01T00:00:00Z', ends_at: '2099-01-01T01:00:00Z' };
    expect(lifecycleActions({ status: 'draft', ...soon })).toMatchObject({
      publish: true,
      cancel: false,
    });
    expect(lifecycleActions({ status: 'published', ...soon })).toMatchObject({
      publish: false,
      cancel: true,
      complete: false,
    });
    expect(
      lifecycleActions({
        status: 'published',
        starts_at: '2020-01-01T00:00:00Z',
        ends_at: '2099-01-01T00:00:00Z',
      }).complete,
    ).toBe(true);
  });
});

describe('admin event detail', () => {
  it('publish sends status published', async () => {
    await render(wrap(<AdminEventDetail eventId={EVENT} />));
    await fireEvent.press(await screen.findByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(updates).toEqual([{ status: 'published' }]));
  });

  it('cancel asks first, then sends status cancelled', async () => {
    status = 'published';
    await render(wrap(<AdminEventDetail eventId={EVENT} />));
    await fireEvent.press(await screen.findByRole('button', { name: 'Cancel event' }));
    expect(updates).toEqual([]);
    expect(await screen.findByText('Cancel this event?')).toBeTruthy();
    const buttons = screen.getAllByRole('button', { name: 'Cancel event' });
    await fireEvent.press(buttons[buttons.length - 1] as never);
    await waitFor(() => expect(updates).toEqual([{ status: 'cancelled' }]));
  });

  it('team add sends set_event_staff with the chosen duty', async () => {
    status = 'published';
    await render(wrap(<AdminEventDetail eventId={EVENT} />));
    await fireEvent.changeText(await screen.findByLabelText('Find a member'), 'kab');
    await fireEvent.press(await screen.findByRole('button', { name: 'Pick Kabir Placeholder' }));
    await fireEvent.press(await screen.findByText('Check-in'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Save team member' }));
    await waitFor(() =>
      expect(rpcCalls.filter(([n]) => n === 'set_event_staff')).toEqual([
        ['set_event_staff', { event_id: EVENT, member_id: KID, capabilities: ['check_in'] }],
      ]),
    );
  });
});

describe('attendee CSV', () => {
  const rows = [
    {
      member_id: KID,
      member_no: 'DEMO-0001',
      full_name: 'Kabir, "KP" Placeholder',
      branch_name: 'Demo Branch',
      status: 'going',
      registered_at: '2026-11-14T06:30:00.000Z',
      registered_by_guardian: true,
    },
    {
      member_id: 'x',
      member_no: 'DEMO-0002',
      full_name: '=HYPERLINK("x")',
      branch_name: 'Demo Branch',
      status: 'waitlisted',
      registered_at: '2026-11-14T06:30:00.000Z',
      registered_by_guardian: false,
    },
  ];

  it('has the expected columns and escapes cells', () => {
    const lines = attendeesCsv(rows).trimEnd().split('\r\n');
    expect(lines[0]).toBe(ATTENDEE_COLUMNS.join(','));
    expect(ATTENDEE_COLUMNS).toEqual([
      'Member no',
      'Name',
      'Branch',
      'RSVP status',
      'Registered at (IST)',
      'Registered by guardian',
    ]);
    expect(lines[1]).toBe(
      'DEMO-0001,"Kabir, ""KP"" Placeholder",Demo Branch,going,"14 Nov 2026, 12:00 pm",yes',
    );
    // A leading = would run as a formula in a spreadsheet, so it is neutralised.
    expect(lines[2]).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it('counts by status', () => {
    expect(attendeeCounts(rows)).toEqual({ going: 1, waitlisted: 1, cancelled: 0 });
  });
});
