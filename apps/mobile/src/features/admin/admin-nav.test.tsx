import type { AdminAccess, AdminApi } from '@aiaia/api';
import { PERMISSIONS } from '@aiaia/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react-native';
import { AdminApiProvider } from './AdminApiContext';
import { AdminShell } from './AdminShell';
import { adminNav, isAdmin, visibleNav, type AdminNavEntry } from './adminNav';

jest.mock('@/lib/supabase', () => ({ getSupabase: () => ({}) }));

// Entries other briefs will add (P1-03 Approvals, P1-05 Announcements, P1-12a Import), registered
// here only so the visibility rules can be tested against the full picture. P1-07a's Events entry
// is now real (in adminNav), so it is no longer stubbed here.
const OTHER_BRIEFS: AdminNavEntry[] = [
  { key: 'approvals', label: 'Approvals', href: '/approvals', anyOf: ['members.approve'] },
  {
    key: 'announcements',
    label: 'Announcements',
    href: '/announcements',
    anyOf: ['announcements.branch', 'announcements.national'],
  },
  { key: 'import', label: 'Import', href: '/import', anyOf: ['roster.import'] },
];
const ENTRIES = [...adminNav, ...OTHER_BRIEFS];
const BRANCH = 'c0000000-0000-4000-8000-00000000000a';

const grants = (keys: readonly string[], branch: string | null = null) =>
  keys.map((permission_key) => ({ permission_key, branch_id: branch }));

const BRANCH_PRESIDENT = grants(
  [
    'members.approve',
    'members.manage',
    'announcements.branch',
    'events.branch',
    'payments.view_branch',
    'certificates.issue',
    'roster.import',
    'members.verify_id',
  ],
  BRANCH,
);

function renderShell(access: AdminAccess) {
  const api = { getAccess: () => Promise.resolve(access) } as unknown as AdminApi;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AdminApiProvider api={api}>
        <AdminShell
          activeKey="dashboard"
          entries={ENTRIES}
          breakpoint={0}
          onNavigate={() => undefined}
          onSwitchToMemberView={() => undefined}
        >
          {null}
        </AdminShell>
      </AdminApiProvider>
    </QueryClientProvider>,
  );
}

const labels = (permissions: AdminAccess['permissions']) =>
  visibleNav(permissions, ENTRIES).map((e) => e.label);

describe('admin nav visibility', () => {
  it('shows an ordinary member no admin', () => {
    expect(isAdmin([], ENTRIES)).toBe(false);
    expect(isAdmin(grants(['members.verify_id']), ENTRIES)).toBe(false);
  });

  it('gives a branch president the day-to-day entries but not Roles, Audit log or Settings', () => {
    const shown = labels(BRANCH_PRESIDENT);
    expect(shown).toEqual(
      expect.arrayContaining(['Approvals', 'Members', 'Events', 'Announcements', 'Import']),
    );
    expect(shown).not.toContain('Roles');
    expect(shown).not.toContain('Audit log');
    expect(shown).not.toContain('Settings');
  });

  it('gives a super admin with a step-up everything', () => {
    const shown = labels(grants(PERMISSIONS));
    expect(shown).toEqual(ENTRIES.map((e) => e.label));
  });
});

describe('AdminShell', () => {
  it('shows an ordinary member no admin area', async () => {
    await renderShell({ permissions: [], needsStepUp: false });
    expect(await screen.findByText('No admin access')).toBeTruthy();
    expect(screen.queryByText('Members')).toBeNull();
  });

  it('shows a branch president the permitted entries only', async () => {
    await renderShell({ permissions: BRANCH_PRESIDENT, needsStepUp: false });
    expect(await screen.findByText('Approvals')).toBeTruthy();
    for (const l of ['Members', 'Events', 'Announcements', 'Import']) {
      expect(screen.getByText(l)).toBeTruthy();
    }
    for (const l of ['Roles', 'Audit log', 'Settings']) {
      expect(screen.queryByText(l)).toBeNull();
    }
  });

  it('shows a super admin with a step-up every entry', async () => {
    await renderShell({ permissions: grants(PERMISSIONS), needsStepUp: false });
    await waitFor(() => expect(screen.getByText('Settings')).toBeTruthy());
    for (const e of ENTRIES) expect(screen.getByText(e.label)).toBeTruthy();
  });

  it('shows a super admin without a step-up the step-up screen, not the console', async () => {
    await renderShell({ permissions: [], needsStepUp: true });
    expect(await screen.findByText('Email verification required')).toBeTruthy();
    expect(screen.queryByText('Settings')).toBeNull();
    expect(screen.queryByText('Dashboard')).toBeNull();
  });
});
