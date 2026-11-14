import type { Api } from '@aiaia/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { Slot } from 'expo-router';
import { renderRouter, screen } from 'expo-router/testing-library';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text } from 'react-native';
import AdultConsentRoute from '../../../app/(auth)/adult-consent';
import FamilyRoute from '../../../app/(app)/profile/family';
import IndexRoute from '../../../app/index';
import ProfileRoute from '../../../app/(app)/profile/index';
import { AuthGate } from '@/lib/AuthGate';
import { ApiProvider } from '@/features/auth/useApi';
import type { SessionState } from '@/lib/session';

jest.mock('@/lib/supabase', () => ({
  getSupabase: () => {
    throw new Error('screens must go through useApi, not the Supabase client');
  },
}));

let mockState: SessionState = 'active';
const mockRefresh = jest.fn();
jest.mock('@/lib/session', () => ({
  ...jest.requireActual('@/lib/session'),
  useSessionState: () => mockState,
  useRefreshMembership: () => mockRefresh,
}));

const BRANCH = '00000000-0000-4000-8000-000000000001';
const mockProfile = {
  myProfile: jest.fn(),
  updateProfile: jest.fn(),
  myDependents: jest.fn(),
  addDependent: jest.fn(),
  createClaimCode: jest.fn(),
  giveAdultConsent: jest.fn(),
};
const mockDirectory = { branches: jest.fn() };
const mockAuth = { signOut: jest.fn() };
const api = {
  profile: mockProfile,
  directory: mockDirectory,
  auth: mockAuth,
  _client: {},
} as unknown as Api;

function wrap(Route: () => React.JSX.Element | null) {
  return function Wrapped() {
    return (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 800 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <QueryClientProvider client={new QueryClient()}>
          <ApiProvider api={api}>
            <Route />
          </ApiProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    );
  };
}

const routes = {
  index: () => null,
  '(app)/_layout': () => <Slot />,
  '(app)/home': () => <Text>Home page</Text>,
  '(app)/profile/index': wrap(ProfileRoute),
  '(app)/profile/family': wrap(FamilyRoute),
  pass: () => <Text>Pass page</Text>,
  privacy: () => null,
};

function profileOf(
  over: Record<string, unknown> = {},
  priv: Record<string, unknown> = {},
  dependents: unknown[] = [],
) {
  return {
    member: {
      id: 'm1',
      full_name: 'Aarav Testwala',
      branch_id: BRANCH,
      status: 'active',
      gender: null,
      city: 'Pune',
      occupation: null,
      education: null,
      privacy: { show_phone: false, show_email: false },
      ...over,
    },
    private: {
      dob: '2000-01-15',
      email: 'aarav.testwala@example.test',
      emergency_contact_name: 'Riya Testwala',
      emergency_contact_phone: '+919000000011',
      notify_prefs: { whatsapp: true, email_updates: false, push: false },
      ...priv,
    },
    dependents,
  };
}

const teenOf = (over: Record<string, unknown> = {}) => ({
  member_id: 'd1',
  full_name: 'Kabir Testwala',
  status: 'active',
  wing: 'youth',
  member_no: null,
  branch_id: BRANCH,
  dob: '2010-01-01',
  relationship: 'parent',
  has_login: false,
  claim_code_expires_at: null,
  ...over,
});

beforeEach(() => {
  mockState = 'active';
  [mockRefresh, mockAuth.signOut, mockDirectory.branches, ...Object.values(mockProfile)].forEach(
    (m) => m.mockReset(),
  );
  mockDirectory.branches.mockResolvedValue([{ id: BRANCH, name: 'Pune Branch' }]);
  mockProfile.myDependents.mockResolvedValue({ ok: true, items: [] });
});

describe('My profile', () => {
  it('shows email, DOB and branch as read-only text, not inputs', async () => {
    mockProfile.myProfile.mockResolvedValue({ ok: true, profile: profileOf() });
    await renderRouter(routes, { initialUrl: '/profile' });
    expect(await screen.findByText(/aarav.testwala@example.test/)).toBeTruthy();
    expect(screen.getByText(/2000-01-15/)).toBeTruthy();
    expect(await screen.findByText(/Pune Branch/)).toBeTruthy();
    expect(screen.queryByLabelText('Email')).toBeNull();
    expect(screen.queryByLabelText('Date of birth')).toBeNull();
  });

  it('saves the edited fields through updateProfile with only the allowed fields', async () => {
    mockProfile.myProfile.mockResolvedValue({ ok: true, profile: profileOf() });
    mockProfile.updateProfile.mockResolvedValue({ ok: true });
    await renderRouter(routes, { initialUrl: '/profile' });
    const city = await screen.findByLabelText('City');
    await fireEvent.changeText(city, 'Mumbai');
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mockProfile.updateProfile).toHaveBeenCalledTimes(1));
    const input = mockProfile.updateProfile.mock.calls[0][0];
    expect(input).toMatchObject({
      memberId: 'm1',
      fullName: 'Aarav Testwala',
      city: 'Mumbai',
      emergencyContactPhone: '+919000000011',
      whatsappOptIn: true,
      emailUpdatesOptIn: false,
    });
    expect(Object.keys(input)).not.toEqual(expect.arrayContaining(['email', 'dob', 'branchId']));
    expect(await screen.findByText('Your profile is saved.')).toBeTruthy();
  });

  it('shows the error when the update changed no row', async () => {
    mockProfile.myProfile.mockResolvedValue({ ok: true, profile: profileOf() });
    mockProfile.updateProfile.mockResolvedValue({
      ok: false,
      kind: 'not_saved',
      message: 'Your changes could not be saved. Please sign in again and retry.',
    });
    await renderRouter(routes, { initialUrl: '/profile' });
    await fireEvent.press(await screen.findByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/could not be saved/)).toBeTruthy();
    expect(screen.queryByText('Your profile is saved.')).toBeNull();
  });

  it('refuses a blank name without calling the API', async () => {
    mockProfile.myProfile.mockResolvedValue({ ok: true, profile: profileOf() });
    await renderRouter(routes, { initialUrl: '/profile' });
    await fireEvent.changeText(await screen.findByLabelText('Full name'), '  ');
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Enter your name.')).toBeTruthy();
    expect(mockProfile.updateProfile).not.toHaveBeenCalled();
  });

  it('links to My pass, and to My family only for an active adult', async () => {
    mockProfile.myProfile.mockResolvedValue({ ok: true, profile: profileOf() });
    const first = await renderRouter(routes, { initialUrl: '/profile' });
    expect(await screen.findByText('My pass')).toBeTruthy();
    expect(screen.getByText('My family')).toBeTruthy();
    await first.unmount();

    mockProfile.myProfile.mockResolvedValue({
      ok: true,
      profile: profileOf({}, { dob: '2010-01-01' }),
    });
    await renderRouter(routes, { initialUrl: '/profile' });
    expect(await screen.findByText('My pass')).toBeTruthy();
    expect(screen.queryByText('My family')).toBeNull();
  });
});

describe('My family', () => {
  it('is guarded for a minor: shows "Not available", never the list or the add button', async () => {
    mockProfile.myProfile.mockResolvedValue({
      ok: true,
      profile: profileOf({}, { dob: '2010-01-01' }),
    });
    await renderRouter(routes, { initialUrl: '/profile/family' });
    expect(await screen.findByText(/Not available/)).toBeTruthy();
    expect(screen.queryByText('Add a family member')).toBeNull();
    expect(mockProfile.myDependents).not.toHaveBeenCalled();
  });

  it('is guarded for a member who is not active', async () => {
    mockProfile.myProfile.mockResolvedValue({
      ok: true,
      profile: profileOf({ status: 'suspended' }),
    });
    await renderRouter(routes, { initialUrl: '/profile/family' });
    expect(await screen.findByText(/Not available/)).toBeTruthy();
    expect(mockProfile.myDependents).not.toHaveBeenCalled();
  });

  it('lists dependents and offers a login only from age 14 with no login yet', async () => {
    mockProfile.myProfile.mockResolvedValue({ ok: true, profile: profileOf() });
    mockProfile.myDependents.mockResolvedValue({
      ok: true,
      items: [
        teenOf(),
        teenOf({ member_id: 'd2', full_name: 'Mira Testwala', dob: '2020-01-01' }),
        teenOf({ member_id: 'd3', full_name: 'Ira Testwala', has_login: true }),
      ],
    });
    await renderRouter(routes, { initialUrl: '/profile/family' });
    expect(await screen.findByText('Kabir Testwala')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Give Kabir their own login' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Give Mira/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Give Ira/ })).toBeNull();
  });

  it('adds a dependent through addDependent and reloads the list', async () => {
    mockProfile.myProfile.mockResolvedValue({ ok: true, profile: profileOf() });
    mockProfile.addDependent.mockResolvedValue({ ok: true, member_id: 'd9', status: 'pending' });
    await renderRouter(routes, { initialUrl: '/profile/family' });
    await fireEvent.press(await screen.findByRole('button', { name: 'Add a family member' }));
    await fireEvent.changeText(screen.getByLabelText('Full name'), 'Nia Testwala');
    await fireEvent.changeText(screen.getByLabelText('Date of birth, day'), '02');
    await fireEvent.changeText(screen.getByLabelText('Date of birth, month'), '03');
    await fireEvent.changeText(screen.getByLabelText('Date of birth, year'), '2015');
    await fireEvent.press(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(mockProfile.addDependent).toHaveBeenCalledWith({
        full_name: 'Nia Testwala',
        dob: '2015-03-02',
      }),
    );
    await waitFor(() => expect(mockProfile.myDependents).toHaveBeenCalledTimes(2));
  });

  it('creates a claim code and shows it with its expiry in IST', async () => {
    mockProfile.myProfile.mockResolvedValue({ ok: true, profile: profileOf() });
    mockProfile.myDependents.mockResolvedValue({ ok: true, items: [teenOf()] });
    mockProfile.createClaimCode.mockResolvedValue({
      ok: true,
      code: 'ABCD2345',
      expiresAt: '2026-11-22T00:00:00Z',
    });
    await renderRouter(routes, { initialUrl: '/profile/family' });
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Give Kabir their own login' }),
    );
    expect(await screen.findByText('ABCD2345')).toBeTruthy();
    expect(mockProfile.createClaimCode).toHaveBeenCalledWith('d1');
    expect(screen.getByText(/Valid until 2026-11-22 05:30 IST/)).toBeTruthy();
  });

  it('shows the friendly message when the code cannot be made', async () => {
    mockProfile.myProfile.mockResolvedValue({ ok: true, profile: profileOf() });
    mockProfile.myDependents.mockResolvedValue({ ok: true, items: [teenOf()] });
    mockProfile.createClaimCode.mockResolvedValue({
      ok: false,
      kind: 'not_allowed',
      message: 'A family member can have their own login from age 14.',
    });
    await renderRouter(routes, { initialUrl: '/profile/family' });
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Give Kabir their own login' }),
    );
    expect(await screen.findByText(/from age 14/)).toBeTruthy();
  });
});

describe('auth gate with the 18th-birthday handover', () => {
  it('lands an active member with adult_consent_required on /adult-consent', async () => {
    mockState = 'adult_consent';
    mockProfile.myProfile.mockResolvedValue({
      ok: true,
      profile: profileOf({ adult_consent_required: true }),
    });
    await renderRouter(
      {
        _layout: () => <AuthGate />,
        index: IndexRoute,
        '(auth)/_layout': () => <Slot />,
        '(auth)/adult-consent': wrap(AdultConsentRoute),
        '(app)/_layout': () => <Slot />,
        '(app)/home': () => <Text>Home page</Text>,
        privacy: () => null,
        'delete-account': () => null,
      },
      { initialUrl: '/' },
    );
    expect(await screen.findByText(/your AIAIA account is now fully yours/)).toBeTruthy();
    expect(screen).toHavePathname('/adult-consent');
    expect(screen.queryByText('Home page')).toBeNull();
  });
});
