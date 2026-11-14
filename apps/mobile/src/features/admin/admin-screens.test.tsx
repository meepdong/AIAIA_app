import type { AdminApi, ExportRow } from '@aiaia/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AdminApiProvider } from './AdminApiContext';
import { DashboardScreen } from './dashboard/DashboardScreen';
import { exportScope } from './permissions';
import { buildMembersCsv } from './members/csv';
import { MemberDetailScreen } from './members/MemberDetailScreen';
import { MembersListScreen } from './members/MembersListScreen';

jest.mock('@/lib/supabase', () => ({ getSupabase: () => ({}) }));
const mockDeliver = jest.fn(() => Promise.resolve());
jest.mock('./members/deliverCsv', () => ({
  deliverCsv: (...args: unknown[]) => (mockDeliver as (...a: unknown[]) => unknown)(...args),
}));

const BRANCH_A = 'c0000000-0000-4000-8000-00000000000a';
const BRANCH_B = 'c0000000-0000-4000-8000-00000000000b';

const grants = (keys: readonly string[], branch: string | null = null) =>
  keys.map((permission_key) => ({ permission_key, branch_id: branch }));

async function renderWith(api: Partial<AdminApi>, ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return await render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 360, height: 640 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <AdminApiProvider api={api as AdminApi}>{ui}</AdminApiProvider>
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}

const access = (permissions: ReturnType<typeof grants>) =>
  jest.fn(() => Promise.resolve({ permissions, needsStepUp: false }));

const DASH = {
  byStatus: { pending: 2, active: 9, suspended: 0, rejected: 0, deleted: 0 },
  byWing: { youth: 6, aiaia: 3 },
  byBranch: [{ branchId: BRANCH_A, code: 'AAA', name: 'Branch A', active: 9 }],
  pending: 2,
  openReports: null as number | null,
  upcomingEvents: [],
};

describe('admin dashboard', () => {
  it('does not ask for or show open reports without reports.review', async () => {
    const getDashboard = jest.fn(() => Promise.resolve(DASH));
    await renderWith(
      { getAccess: access(grants(['members.manage'])), getDashboard },
      <DashboardScreen />,
    );
    await screen.findByText('Pending approvals');
    expect(getDashboard).toHaveBeenCalledWith({ canReviewReports: false });
    expect(screen.queryByText('Open reports')).toBeNull();
  });

  it('shows open reports for a reports.review holder', async () => {
    const getDashboard = jest.fn(() => Promise.resolve({ ...DASH, openReports: 4 }));
    await renderWith(
      { getAccess: access(grants(['reports.review'])), getDashboard },
      <DashboardScreen />,
    );
    await screen.findByText('Open reports');
    expect(getDashboard).toHaveBeenCalledWith({ canReviewReports: true });
    expect(screen.getByTestId('open-reports-count').props.children).toBe('4');
  });
});

describe('admin members list', () => {
  const row = (n: number) => ({
    id: `m${n}`,
    member_no: `AIA-${n}`,
    full_name: `Fake Member ${n}`,
    wing: 'youth',
    status: 'active' as const,
    city: null,
    branch_id: BRANCH_A,
    branches: { code: 'AAA', name: 'Branch A' },
  });

  it('searches and paginates', async () => {
    const listMembers = jest.fn((f: { page?: number }) =>
      Promise.resolve({ rows: [row((f.page ?? 0) + 1)], total: 3, page: f.page ?? 0, pageSize: 1 }),
    );
    await renderWith(
      {
        getAccess: access(grants(['members.manage'])),
        listMembers,
        listBranches: () => Promise.resolve([]),
      },
      <MembersListScreen onOpenMember={() => undefined} pageSize={1} />,
    );
    await screen.findByText('Fake Member 1');
    expect(listMembers).toHaveBeenLastCalledWith(expect.objectContaining({ page: 0, search: '' }));

    await fireEvent.changeText(screen.getByLabelText('Search members'), 'asha');
    await fireEvent.press(screen.getByText('Search'));
    await waitFor(() =>
      expect(listMembers).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 0, search: 'asha' }),
      ),
    );

    await fireEvent.press(screen.getByText('Next'));
    await screen.findByText('Fake Member 2');
    expect(listMembers).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, search: 'asha' }),
    );
    expect(screen.getByText('Page 2 of 3')).toBeTruthy();
  });

  it('shows Export CSV only to data.export holders', async () => {
    const base = {
      listMembers: () => Promise.resolve({ rows: [row(1)], total: 1, page: 0, pageSize: 25 }),
      listBranches: () => Promise.resolve([]),
    };
    const without = await renderWith(
      { ...base, getAccess: access(grants(['members.manage'])) },
      <MembersListScreen onOpenMember={() => undefined} />,
    );
    await screen.findByText('Fake Member 1');
    expect(screen.queryByText('Export CSV')).toBeNull();
    await without.unmount();

    await renderWith(
      { ...base, getAccess: access(grants(['members.manage', 'data.export'])) },
      <MembersListScreen onOpenMember={() => undefined} />,
    );
    await screen.findByText('Export CSV');
  });

  it('exports through the api and hands the CSV to the delivery step', async () => {
    const exportMembers = jest.fn(() =>
      Promise.resolve([
        {
          member_id: 'm1',
          member_no: 'AIA-1',
          full_name: 'Fake Member 1',
          contacts_withheld: false,
          phone: '+91 90000 00001',
        } as unknown as ExportRow,
      ]),
    );
    await renderWith(
      {
        getAccess: access(grants(['members.manage', 'data.export'])),
        listMembers: () => Promise.resolve({ rows: [row(1)], total: 1, page: 0, pageSize: 25 }),
        listBranches: () => Promise.resolve([]),
        exportMembers,
      },
      <MembersListScreen onOpenMember={() => undefined} />,
    );
    await fireEvent.press(await screen.findByText('Export CSV'));
    await waitFor(() => expect(mockDeliver).toHaveBeenCalled());
    expect(exportMembers).toHaveBeenCalledWith({ branchId: null });
    expect(String((mockDeliver.mock.calls[0] as unknown[])[1])).toContain('Fake Member 1');
  });
});

describe('admin member detail', () => {
  const member = {
    id: 'm1',
    member_no: 'AIA-1',
    full_name: 'Fake Member 1',
    wing: 'youth',
    status: 'active' as const,
    city: null,
    gender: null,
    branch_id: BRANCH_A,
    approved_at: null,
    status_reason: null,
    status_changed_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    branches: { code: 'AAA', name: 'Branch A' },
  };
  const detailApi = (permissions: ReturnType<typeof grants>, extra: Partial<AdminApi> = {}) => ({
    getAccess: access(permissions),
    getMember: () => Promise.resolve(member),
    listConsentRecords: () =>
      Promise.resolve([
        {
          id: 'c1',
          method: 'paper_form' as const,
          attested_at: '2026-01-02T00:00:00Z',
          guardian_name: 'Fake Guardian',
          guardian_alerts: true,
          document_path: null,
        },
      ]),
    listStatusEvents: () =>
      Promise.resolve([
        {
          id: 'e1',
          from_status: 'pending' as const,
          to_status: 'active' as const,
          reason: null,
          created_at: '2026-01-03T00:00:00Z',
        },
      ]),
    listBranches: () =>
      Promise.resolve([
        { id: BRANCH_A, code: 'AAA', name: 'Branch A' },
        { id: BRANCH_B, code: 'BBB', name: 'Branch B' },
      ]),
    ...extra,
  });

  it('shows consent records and the history on request', async () => {
    await renderWith(
      detailApi(grants(['members.manage'], BRANCH_A)),
      <MemberDetailScreen memberId="m1" />,
    );
    await screen.findByText('Paper form');
    expect(screen.queryByText('pending to active')).toBeNull();
    await fireEvent.press(screen.getByText('View history'));
    await screen.findByText('pending to active');
  });

  it('hides Edit branch without members.manage on the branch and members.approve', async () => {
    const view = await renderWith(
      detailApi(grants(['members.manage'], BRANCH_A)),
      <MemberDetailScreen memberId="m1" />,
    );
    await screen.findByText('Paper form');
    expect(screen.queryByText('Edit branch')).toBeNull();
    await view.unmount();

    // approve only, no manage
    const v2 = await renderWith(
      detailApi(grants(['members.approve'], BRANCH_A)),
      <MemberDetailScreen memberId="m1" />,
    );
    await screen.findByText('Paper form');
    expect(screen.queryByText('Edit branch')).toBeNull();
    await v2.unmount();

    // manage on a different branch
    await renderWith(
      detailApi([
        ...grants(['members.manage'], BRANCH_B),
        ...grants(['members.approve'], BRANCH_B),
      ]),
      <MemberDetailScreen memberId="m1" />,
    );
    await screen.findByText('Paper form');
    expect(screen.queryByText('Edit branch')).toBeNull();
  });

  it('shows Edit branch with the permissions and calls the RPC with the chosen branch', async () => {
    const setMemberBranch = jest.fn(() => Promise.resolve());
    await renderWith(
      detailApi(
        [...grants(['members.manage'], BRANCH_A), ...grants(['members.approve'], BRANCH_B)],
        { setMemberBranch },
      ),
      <MemberDetailScreen memberId="m1" />,
    );
    await fireEvent.press(await screen.findByText('Edit branch'));
    await fireEvent.press(await screen.findByText('Choose a branch'));
    await fireEvent.press(await screen.findByText('Branch B'));
    await fireEvent.press(screen.getByText('Move member'));
    await waitFor(() => expect(setMemberBranch).toHaveBeenCalledWith('m1', BRANCH_B));
  });

  it('maps a refusal to friendly text', async () => {
    const setMemberBranch = jest.fn(() =>
      Promise.reject({
        code: '42501',
        message: 'admin_set_member_branch: you cannot change your own branch here',
      }),
    );
    await renderWith(
      detailApi(grants(['members.manage', 'members.approve']), { setMemberBranch }),
      <MemberDetailScreen memberId="m1" />,
    );
    await fireEvent.press(await screen.findByText('Edit branch'));
    await fireEvent.press(await screen.findByText('Choose a branch'));
    await fireEvent.press(await screen.findByText('Branch B'));
    await fireEvent.press(screen.getByText('Move member'));
    await screen.findByText('You cannot change your own branch.');
  });
});

describe('members CSV', () => {
  const base: ExportRow = {
    member_id: 'm1',
    member_no: 'AIA-1',
    full_name: 'Fake Member 1',
    branch_code: 'AAA',
    branch_name: 'Branch A',
    wing: 'youth',
    status: 'active',
    gender: 'f',
    city: 'Pune',
    approved_at: '2026-01-01T00:00:00Z',
    is_minor: false,
    has_login: true,
    contacts_withheld: false,
    phone: '+91 90000 00001',
    email: 'fake1@example.test',
    dob: '2000-01-01',
  };

  it('keeps contact cells empty for withheld rows, even if values arrive', () => {
    const csv = buildMembersCsv([
      base,
      { ...base, member_id: 'm2', full_name: 'Fake Member 2', contacts_withheld: true },
    ]);
    const [header, open, withheld] = csv.trim().split('\r\n');
    expect(header).toMatch(/Phone,Email,Date of birth$/);
    expect(open).toMatch(/\+91 90000 00001,fake1@example\.test,2000-01-01$/);
    expect(withheld).toMatch(/yes,,,$/);
    expect(csv).not.toContain(
      'Fake Member 2,AAA,Branch A,youth,active,f,Pune,2026-01-01T00:00:00Z,yes,yes,yes,+91',
    );
  });

  it('quotes cells and defuses formulas', () => {
    const csv = buildMembersCsv([{ ...base, full_name: '=HYPERLINK("x"), Jr', city: 'A,B' }]);
    expect(csv).toContain(`"'=HYPERLINK(""x""), Jr"`);
    expect(csv).toContain('"A,B"');
  });
});

describe('export scope', () => {
  it('needs a national grant for everything, and a branch otherwise', () => {
    expect(exportScope([], null)).toEqual({ kind: 'none' });
    expect(exportScope(grants(['data.export']), null)).toEqual({ kind: 'ok', branchId: null });
    expect(exportScope(grants(['data.export'], BRANCH_A), null)).toEqual({
      kind: 'ok',
      branchId: BRANCH_A,
    });
    expect(
      exportScope(
        [...grants(['data.export'], BRANCH_A), ...grants(['data.export'], BRANCH_B)],
        null,
      ),
    ).toEqual({ kind: 'pick_branch' });
  });
});
