import type { AdminApi, RoleAssignmentRow, SettingRow } from '@aiaia/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AdminApiProvider } from './AdminApiContext';
import { AuditLogScreen } from './audit/AuditLogScreen';
import { friendlyAdminError } from './errors';
import { RolesScreen } from './roles/RolesScreen';
import { parseDraft, SettingsScreen } from './settings/SettingsScreen';

jest.mock('@/lib/supabase', () => ({ getSupabase: () => ({}) }));

const BRANCH_A = 'c0000000-0000-4000-8000-00000000000a';
const MEMBER = 'a0000000-0000-4000-8000-000000000001';
const OTHER = 'a0000000-0000-4000-8000-000000000002';

const grants = (keys: readonly string[]) =>
  keys.map((permission_key) => ({ permission_key, branch_id: null }));
const access = (keys: readonly string[]) =>
  jest.fn(() => Promise.resolve({ permissions: grants(keys), needsStepUp: false }));

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

const memberRow = {
  id: MEMBER,
  member_no: 'AIA-1',
  full_name: 'Fake Member 1',
  wing: 'youth',
  status: 'active' as const,
  city: null,
  branch_id: BRANCH_A,
  branches: { code: 'AAA', name: 'Branch A' },
};
const listMembers = () => Promise.resolve({ rows: [memberRow], total: 1, page: 0, pageSize: 6 });

describe('admin roles screen', () => {
  const roles = [
    {
      key: 'branch_president',
      name: 'Branch President',
      scope: 'branch' as const,
      description: null,
    },
    {
      key: 'national_secretary',
      name: 'National Secretary',
      scope: 'national' as const,
      description: null,
    },
  ];
  const current: RoleAssignmentRow = {
    id: 'ra-current',
    member_id: OTHER,
    role_key: 'branch_president',
    branch_id: BRANCH_A,
    starts_on: '2026-01-01',
    ends_on: null,
    members: { full_name: 'Fake Officer', member_no: 'AIA-2' },
    roles: { name: 'Branch President', scope: 'branch' },
    branches: { code: 'AAA', name: 'Branch A' },
  };
  const ended: RoleAssignmentRow = {
    ...current,
    id: 'ra-ended',
    starts_on: '2020-01-01',
    ends_on: '2020-12-31',
    members: { full_name: 'Fake Former', member_no: 'AIA-3' },
  };
  const base = (extra: Partial<AdminApi> = {}): Partial<AdminApi> => ({
    getAccess: access(['roles.assign']),
    listRoles: () => Promise.resolve(roles),
    listBranches: () => Promise.resolve([{ id: BRANCH_A, code: 'AAA', name: 'Branch A' }]),
    listRoleAssignments: () => Promise.resolve([current]),
    listMembers,
    ...extra,
  });

  async function fillForm() {
    await fireEvent.changeText(await screen.findByLabelText('Member search'), 'fake');
    await fireEvent.press(screen.getByText('Find member'));
    await fireEvent.press(await screen.findByLabelText('Pick Fake Member 1'));
    await fireEvent.press(await screen.findByText('Choose a role'));
    await fireEvent.press(await screen.findByText('Branch President (branch)'));
    await fireEvent.press(await screen.findByText('Choose a branch'));
    await fireEvent.press(await screen.findByLabelText('Branch A'));
    await fireEvent.press(screen.getByText('Assign role'));
  }

  it('assigns the chosen member, role and branch through assign_role', async () => {
    const assignRole = jest.fn(() => Promise.resolve());
    await renderWith(base({ assignRole }), <RolesScreen />);
    await fillForm();
    await waitFor(() =>
      expect(assignRole).toHaveBeenCalledWith({
        memberId: MEMBER,
        roleKey: 'branch_president',
        branchId: BRANCH_A,
      }),
    );
  });

  it('shows friendly text when the server refuses a self-assignment', async () => {
    const assignRole = jest.fn(() =>
      Promise.reject({
        code: '42501',
        message: 'assign_role: you cannot assign a role to yourself',
      }),
    );
    await renderWith(base({ assignRole }), <RolesScreen />);
    await fillForm();
    await screen.findByText(
      'You cannot assign a role to yourself. Ask another office-bearer to do it.',
    );
    expect(screen.queryByText(/assign_role:/)).toBeNull();
  });

  it('lists current roles by branch and toggles term history', async () => {
    const listRoleAssignments = jest.fn((o: { includeEnded?: boolean }) =>
      Promise.resolve(o.includeEnded ? [current, ended] : [current]),
    );
    await renderWith(base({ listRoleAssignments }), <RolesScreen />);
    await screen.findByText('Fake Officer: Branch President');
    expect(screen.getByText('Branch A')).toBeTruthy();
    expect(screen.queryByText('Fake Former: Branch President')).toBeNull();
    expect(listRoleAssignments).toHaveBeenLastCalledWith({ includeEnded: false });

    await fireEvent.press(screen.getByText('Show term history'));
    await screen.findByText('Fake Former: Branch President');
    expect(listRoleAssignments).toHaveBeenLastCalledWith({ includeEnded: true });
    expect(screen.getByText('Ended')).toBeTruthy();
    expect(screen.getByText('Hide term history')).toBeTruthy();
  });

  it('asks for confirmation before ending a role, then calls end_role', async () => {
    const endRole = jest.fn(() => Promise.resolve());
    await renderWith(base({ endRole }), <RolesScreen />);
    await fireEvent.press(
      await screen.findByLabelText('End role Branch President for Fake Officer'),
    );
    await screen.findByText('End this role?');
    expect(endRole).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('End role'));
    await waitFor(() => expect(endRole).toHaveBeenCalledWith('ra-current'));
  });

  it('shows no form to someone without roles.assign', async () => {
    const listRoleAssignments = jest.fn(() => Promise.resolve([]));
    await renderWith(
      base({ getAccess: access(['members.manage']), listRoleAssignments }),
      <RolesScreen />,
    );
    await screen.findByText('You do not have permission to manage roles.');
    expect(listRoleAssignments).not.toHaveBeenCalled();
  });
});

describe('admin audit log screen', () => {
  const row = {
    id: 7,
    created_at: '2026-11-14T10:00:00Z',
    actor_member_id: OTHER,
    action: 'role.assigned',
    entity: 'role_assignments',
    entity_id: 'ra-1',
    details: { role_key: 'branch_president' },
  };
  const page = { rows: [row], total: 1, page: 0, pageSize: 25 };
  const base = (extra: Partial<AdminApi> = {}): Partial<AdminApi> => ({
    getAccess: access(['audit.view']),
    listAuditLog: jest.fn(() => Promise.resolve(page)),
    getMemberNames: () => Promise.resolve({ [OTHER]: 'Fake Officer' }),
    listMembers,
    ...extra,
  });

  it('passes the actor, action and date filters through to the query', async () => {
    const listAuditLog = jest.fn(() => Promise.resolve(page));
    await renderWith(base({ listAuditLog }), <AuditLogScreen />);
    await screen.findByText('role.assigned');
    expect(listAuditLog).toHaveBeenLastCalledWith(
      expect.objectContaining({ actorId: null, action: '', from: null, to: null, page: 0 }),
    );

    await fireEvent.changeText(screen.getByLabelText('Actor search'), 'fake');
    await fireEvent.press(screen.getByText('Find member'));
    await fireEvent.press(await screen.findByLabelText('Pick Fake Member 1'));
    await fireEvent.changeText(screen.getByLabelText('Action filter'), 'role');
    await fireEvent.changeText(screen.getByLabelText('From date'), '2026-11-01');
    await fireEvent.changeText(screen.getByLabelText('To date'), '2026-11-30');
    await fireEvent.press(screen.getByText('Apply filters'));
    await waitFor(() =>
      expect(listAuditLog).toHaveBeenLastCalledWith(
        expect.objectContaining({
          actorId: MEMBER,
          action: 'role',
          from: '2026-11-01',
          to: '2026-11-30',
          page: 0,
        }),
      ),
    );
  });

  it('refuses a malformed date without querying', async () => {
    const listAuditLog = jest.fn(() => Promise.resolve(page));
    await renderWith(base({ listAuditLog }), <AuditLogScreen />);
    await screen.findByText('role.assigned');
    const calls = listAuditLog.mock.calls.length;
    await fireEvent.changeText(screen.getByLabelText('From date'), '01/11/2026');
    await fireEvent.press(screen.getByText('Apply filters'));
    await screen.findByText('Use dates like 2026-11-30.');
    expect(listAuditLog.mock.calls.length).toBe(calls);
  });

  it('paginates', async () => {
    const listAuditLog = jest.fn((f: { page?: number }) =>
      Promise.resolve({ rows: [row], total: 40, page: f.page ?? 0, pageSize: 25 }),
    );
    await renderWith(base({ listAuditLog }), <AuditLogScreen />);
    await screen.findByText('Page 1 of 2');
    await fireEvent.press(screen.getByText('Next'));
    await screen.findByText('Page 2 of 2');
    expect(listAuditLog).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));
  });

  it('opens a row to show action, actor, target and details', async () => {
    await renderWith(base(), <AuditLogScreen />);
    await fireEvent.press(await screen.findByLabelText('Open audit entry role.assigned'));
    const detail = await screen.findByTestId('audit-detail');
    expect(detail).toBeTruthy();
    await screen.findByText('role_assignments ra-1');
    expect(screen.getAllByText(/Fake Officer/).length).toBeGreaterThan(0);
    expect(screen.getByText(/"role_key": "branch_president"/)).toBeTruthy();
  });
});

describe('admin settings screen', () => {
  const setting = (over: Partial<SettingRow>): SettingRow => ({
    key: 'k',
    value: null,
    is_public: false,
    description: 'A fake setting.',
    updated_at: '2026-11-14T10:00:00Z',
    is_secret: false,
    editable: true,
    ...over,
  });
  const rows = [
    setting({ key: 'webhook_secret', value: null, is_secret: true, editable: false }),
    setting({ key: 'notify_dispatch_url', value: 'https://example.test/x', editable: false }),
    setting({ key: 'registration_open', value: true }),
    setting({ key: 'club_name', value: 'Fake Club' }),
  ];
  const base = (extra: Partial<AdminApi> = {}): Partial<AdminApi> => ({
    getAccess: access(['system.config']),
    listSettings: () => Promise.resolve(rows),
    ...extra,
  });

  it('shows a secret setting as Hidden with no way to edit it', async () => {
    await renderWith(base(), <SettingsScreen />);
    await screen.findByText('webhook_secret');
    expect(screen.getByTestId('setting-value-webhook_secret').props.children).toBe('Hidden');
    expect(screen.queryByLabelText('Edit webhook_secret')).toBeNull();
    expect(screen.getByText(/Secret value\. It is never shown/)).toBeTruthy();
  });

  it('shows a locked setting read-only with a reason', async () => {
    await renderWith(base(), <SettingsScreen />);
    await screen.findByText('notify_dispatch_url');
    expect(screen.getByText('https://example.test/x')).toBeTruthy();
    expect(screen.queryByLabelText('Edit notify_dispatch_url')).toBeNull();
    expect(screen.getByText(/This setting can't be changed from the app/)).toBeTruthy();
  });

  it('saves a boolean as a JSON boolean', async () => {
    const setSetting = jest.fn(() => Promise.resolve());
    await renderWith(base({ setSetting }), <SettingsScreen />);
    await fireEvent.press(await screen.findByLabelText('Edit registration_open'));
    await fireEvent(screen.getByLabelText('Value of registration_open'), 'valueChange', false);
    await fireEvent.press(screen.getByLabelText('Save registration_open'));
    await waitFor(() => expect(setSetting).toHaveBeenCalledWith('registration_open', false));
  });

  it('saves a text setting as a string', async () => {
    const setSetting = jest.fn(() => Promise.resolve());
    await renderWith(base({ setSetting }), <SettingsScreen />);
    await fireEvent.press(await screen.findByLabelText('Edit club_name'));
    await fireEvent.changeText(screen.getByLabelText('Value of club_name'), 'Other Fake Club');
    await fireEvent.press(screen.getByLabelText('Save club_name'));
    await waitFor(() => expect(setSetting).toHaveBeenCalledWith('club_name', 'Other Fake Club'));
  });

  it('shows friendly text when the server says the setting is locked', async () => {
    const setSetting = jest.fn(() =>
      Promise.reject({
        code: '42501',
        message: 'admin_set_setting: this setting cannot be changed here',
      }),
    );
    await renderWith(base({ setSetting }), <SettingsScreen />);
    await fireEvent.press(await screen.findByLabelText('Edit club_name'));
    await fireEvent.press(screen.getByLabelText('Save club_name'));
    await screen.findByText('This setting is locked and cannot be changed here.');
    expect(screen.queryByText(/admin_set_setting/)).toBeNull();
  });

  it('shows nothing editable to someone without system.config', async () => {
    const listSettings = jest.fn(() => Promise.resolve(rows));
    await renderWith(base({ getAccess: access(['audit.view']), listSettings }), <SettingsScreen />);
    await screen.findByText('You do not have permission to change settings.');
    expect(listSettings).not.toHaveBeenCalled();
  });
});

describe('settings value parsing', () => {
  it('keeps types: numbers become numbers, JSON stays JSON, bad input is refused', () => {
    expect(parseDraft('number', ' 42 ')).toEqual({ ok: true, value: 42 });
    expect(parseDraft('number', 'abc').ok).toBe(false);
    expect(parseDraft('string', ' x ')).toEqual({ ok: true, value: ' x ' });
    expect(parseDraft('json', '["super_admin"]')).toEqual({ ok: true, value: ['super_admin'] });
    expect(parseDraft('json', '[').ok).toBe(false);
  });
});

describe('friendlyAdminError for roles and settings', () => {
  it.each([
    ['42501', 'assign_role: global roles need system.config', /Global roles/],
    [
      '23514',
      'assign_role: the member already holds this role for an overlapping term',
      /overlapping/,
    ],
    ['23514', 'end_role: the last super admin cannot be removed', /last super admin/],
    ['22023', 'admin_set_setting: value is limited to 10000 characters', /too long/],
    ['22023', 'admin_set_setting: club_name expects a JSON string', /wrong type/],
    ['42501', 'admin_set_setting: this setting cannot be changed here', /locked/],
    [
      '22023',
      'admin_set_setting: adult_handover_grace_days expects a whole number from 0 to 365',
      /^This value expects a whole number from 0 to 365.$/,
    ],
    [
      '23514',
      'new row for relation "app_settings" violates check constraint "app_settings_step_up_roles_keeps_super_admin"',
      /super_admin/,
    ],
  ])('%s %s', (code, message, expected) => {
    expect(friendlyAdminError({ code, message })).toMatch(expected);
  });

  it('never echoes unknown server text', () => {
    expect(friendlyAdminError({ code: 'XX000', message: 'secret internals 123' })).toBe(
      'Something went wrong. Please try again.',
    );
  });
});
