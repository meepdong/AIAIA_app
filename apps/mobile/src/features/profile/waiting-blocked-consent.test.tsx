import type { Api } from '@aiaia/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import { act } from '@testing-library/react-native';
import { AppState, Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AdultConsentRoute from '../../../app/(auth)/adult-consent';
import BlockedRoute from '../../../app/(auth)/blocked';
import WaitingRoomRoute from '../../../app/(auth)/waiting-room';
import { ApiProvider } from '@/features/auth/useApi';
import { draftFromProfile } from './form';
import { mailtoFor, parseGrievance, telFor } from './BlockedScreen';
import { WAITING_POLL_MS } from './WaitingRoomScreen';

jest.mock('@/lib/supabase', () => ({
  getSupabase: () => {
    throw new Error('screens must go through useApi, not the Supabase client');
  },
}));

const mockRefresh = jest.fn();
jest.mock('@/lib/session', () => ({
  ...jest.requireActual('@/lib/session'),
  useRefreshMembership: () => mockRefresh,
}));

const BRANCH = '00000000-0000-4000-8000-000000000001';
const mockProfile = {
  myProfile: jest.fn(),
  infoRequests: jest.fn(),
  submitApplication: jest.fn(),
  giveAdultConsent: jest.fn(),
  userId: jest.fn(),
};
const mockSettings = { getSetting: jest.fn() };
const mockDirectory = { branches: jest.fn() };
const mockAuth = { signOut: jest.fn() };
const api = {
  profile: mockProfile,
  settings: mockSettings,
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
  '(auth)/waiting-room': wrap(WaitingRoomRoute),
  '(auth)/blocked': wrap(BlockedRoute),
  '(auth)/adult-consent': wrap(AdultConsentRoute),
  '(app)/home': () => null,
  '(auth)/phone': () => null,
  privacy: () => null,
  'delete-account': () => null,
};

function profileOf(over: Record<string, unknown> = {}, priv: Record<string, unknown> = {}) {
  return {
    member: {
      id: 'm1',
      full_name: 'Aarav Testwala',
      branch_id: BRANCH,
      status: 'pending',
      status_reason: null,
      gender: null,
      city: 'Pune',
      occupation: null,
      education: null,
      privacy: { show_phone: false, show_email: false },
      ...over,
    },
    private: {
      dob: '2000-01-15',
      email: null,
      emergency_contact_name: 'Riya Testwala',
      emergency_contact_phone: '+919000000011',
      notify_prefs: { whatsapp: true, email_updates: false },
      ...priv,
    },
    dependents: [],
  };
}

beforeEach(() => {
  [mockRefresh, mockAuth.signOut, ...Object.values(mockProfile)].forEach((m) => m.mockReset());
  mockSettings.getSetting.mockReset();
  mockDirectory.branches.mockReset();
  mockDirectory.branches.mockResolvedValue([{ id: BRANCH, name: 'Pune Branch' }]);
  mockRefresh.mockResolvedValue('pending');
  mockProfile.infoRequests.mockResolvedValue({ ok: true, items: [] });
  mockSettings.getSetting.mockResolvedValue({ ok: true, value: null });
});

describe('draftFromProfile', () => {
  it('maps my_profile() back onto the form, with the national phone number', () => {
    const draft = draftFromProfile(profileOf() as never);
    expect(draft).toMatchObject({
      fullName: 'Aarav Testwala',
      branchId: BRANCH,
      dob: '2000-01-15',
      emergencyPhone: '9000000011',
      whatsappOptIn: true,
      emailUpdatesOptIn: false,
    });
  });
});

describe('waiting room', () => {
  it('shows what was submitted and the approver requests', async () => {
    mockProfile.myProfile.mockResolvedValue({ ok: true, profile: profileOf() });
    mockProfile.infoRequests.mockResolvedValue({
      ok: true,
      items: [{ id: 'n1', message: 'Please confirm your branch', createdAt: '2026-11-15' }],
    });
    await renderRouter(routes, { initialUrl: '/waiting-room' });
    expect(await screen.findByText('Please confirm your branch')).toBeTruthy();
    expect(screen.getByText(/Aarav Testwala/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
  });

  it('re-submits an edited application through submit_application', async () => {
    mockProfile.myProfile.mockResolvedValue({ ok: true, profile: profileOf() });
    mockProfile.submitApplication.mockResolvedValue({ ok: true, member_id: 'm1' });
    await renderRouter(routes, { initialUrl: '/waiting-room' });
    await fireEvent.press(await screen.findByRole('button', { name: 'Edit my application' }));
    expect((await screen.findByLabelText('Full name')).props.value).toBe('Aarav Testwala');
    await fireEvent.changeText(screen.getByLabelText('Full name'), 'Aarav T Testwala');
    for (let i = 0; i < 3; i += 1) {
      await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    }
    await fireEvent.press(screen.getByRole('button', { name: 'Submit application' }));
    await waitFor(() => expect(mockProfile.submitApplication).toHaveBeenCalled());
    expect(mockProfile.submitApplication).toHaveBeenCalledWith(
      expect.objectContaining({ full_name: 'Aarav T Testwala', dob: '2000-01-15' }),
    );
    expect(await screen.findByText('What you submitted')).toBeTruthy();
  });

  it('moves into the app when a check finds the member approved', async () => {
    mockProfile.myProfile.mockResolvedValue({ ok: true, profile: profileOf() });
    await renderRouter(routes, { initialUrl: '/waiting-room' });
    mockRefresh.mockResolvedValue('active');
    await fireEvent.press(await screen.findByRole('button', { name: 'Check now' }));
    await waitFor(() => expect(screen).toHavePathname('/home'));
  });

  it('stays put while the check says pending', async () => {
    mockProfile.myProfile.mockResolvedValue({ ok: true, profile: profileOf() });
    await renderRouter(routes, { initialUrl: '/waiting-room' });
    await fireEvent.press(await screen.findByRole('button', { name: 'Check now' }));
    expect(mockRefresh).toHaveBeenCalled();
    expect(screen).toHavePathname('/waiting-room');
  });
});

describe('waiting room poll', () => {
  let appState: jest.SpyInstance;
  let onChange: (s: string) => void;
  beforeEach(() => {
    jest.useFakeTimers();
    appState = jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _t: string,
      cb: (s: string) => void,
    ) => {
      onChange = cb;
      return { remove: jest.fn() };
    }) as never);
    mockProfile.myProfile.mockResolvedValue({ ok: true, profile: profileOf() });
  });
  afterEach(() => {
    appState.mockRestore();
    jest.useRealTimers();
  });

  it('re-reads every WAITING_POLL_MS and moves into the app once approved', async () => {
    mockRefresh.mockResolvedValueOnce('pending').mockResolvedValue('active');
    await renderRouter(routes, { initialUrl: '/waiting-room' });
    expect(mockRefresh).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(WAITING_POLL_MS);
    });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(screen).toHavePathname('/waiting-room');
    await act(async () => {
      jest.advanceTimersByTime(WAITING_POLL_MS);
    });
    expect(mockRefresh).toHaveBeenCalledTimes(2);
    expect(screen).toHavePathname('/home');
  });

  it('stops polling in the background and resumes when active again', async () => {
    mockRefresh.mockResolvedValue('pending');
    await renderRouter(routes, { initialUrl: '/waiting-room' });
    await act(async () => {
      onChange('background');
    });
    await act(async () => {
      jest.advanceTimersByTime(WAITING_POLL_MS * 3);
    });
    expect(mockRefresh).not.toHaveBeenCalled();
    await act(async () => {
      onChange('active');
    });
    expect(mockRefresh).toHaveBeenCalledTimes(1); // an immediate check on return
    await act(async () => {
      jest.advanceTimersByTime(WAITING_POLL_MS);
    });
    expect(mockRefresh).toHaveBeenCalledTimes(2);
  });
});

describe('blocked screen', () => {
  const grievance = {
    ok: true,
    value: {
      title: 'Grievance Officer',
      name: 'Meera Testwala',
      email: 'g@example.org',
      phone: '+91 90000 00099',
    },
  };

  it('shows the reason and builds the contact links itself', async () => {
    mockProfile.myProfile.mockResolvedValue({
      ok: true,
      profile: profileOf({ status: 'suspended', status_reason: 'Breach of conduct' }),
    });
    mockSettings.getSetting.mockResolvedValue(grievance);
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);
    await renderRouter(routes, { initialUrl: '/blocked' });
    expect(await screen.findByText('Breach of conduct')).toBeTruthy();
    expect(mockSettings.getSetting).toHaveBeenCalledWith('grievance_officer');
    await fireEvent.press(await screen.findByText('g@example.org'));
    expect(open).toHaveBeenCalledWith('mailto:g@example.org');
    await fireEvent.press(screen.getByText('+91 90000 00099'));
    expect(open).toHaveBeenCalledWith('tel:+919000000099');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
    open.mockRestore();
  });

  it('adds "Changed your mind?" only for deleted accounts', async () => {
    mockProfile.myProfile.mockResolvedValue({
      ok: true,
      profile: profileOf({ status: 'deleted' }),
    });
    await renderRouter(routes, { initialUrl: '/blocked' });
    expect(
      await screen.findByText('Changed your mind? Contact support within 6 months.'),
    ).toBeTruthy();
  });

  it('does not say it for a rejected account', async () => {
    mockProfile.myProfile.mockResolvedValue({
      ok: true,
      profile: profileOf({ status: 'rejected', status_reason: 'Duplicate' }),
    });
    await renderRouter(routes, { initialUrl: '/blocked' });
    expect(await screen.findByText('Duplicate')).toBeTruthy();
    expect(screen.queryByText(/Changed your mind/)).toBeNull();
  });

  it('never turns a stored value into a link scheme', () => {
    expect(mailtoFor('javascript:alert(1)')).toBeNull();
    expect(telFor('javascript:alert(1)')).toBeNull();
    expect(mailtoFor('a@b.org')).toBe('mailto:a@b.org');
    expect(parseGrievance('nope')).toBeNull();
    expect(parseGrievance({ name: 'x' })).toBeNull();
  });
});

describe('adult consent screen', () => {
  it('shows the current settings and accepts with them', async () => {
    mockProfile.myProfile.mockResolvedValue({
      ok: true,
      profile: profileOf(
        { status: 'active' },
        { notify_prefs: { whatsapp: false, email_updates: false } },
      ),
    });
    mockProfile.giveAdultConsent.mockResolvedValue({ ok: true, member_id: 'm1' });
    mockRefresh.mockResolvedValue('active');
    await renderRouter(routes, { initialUrl: '/adult-consent' });
    expect(
      await screen.findByText("You're 18, so your AIAIA account is now fully yours."),
    ).toBeTruthy();
    await fireEvent.press(await screen.findByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(mockProfile.giveAdultConsent).toHaveBeenCalled());
    expect(mockProfile.giveAdultConsent).toHaveBeenCalledWith(
      expect.objectContaining({
        whatsapp_opt_in: false,
        email_updates_opt_in: false,
        privacy: expect.objectContaining({ show_phone: false, show_email: false }),
      }),
    );
    await waitFor(() => expect(screen).toHavePathname('/home'));
  });

  it('stays put and says "Saved. Reconnecting…" when the refresh failed', async () => {
    mockProfile.myProfile.mockResolvedValue({ ok: true, profile: profileOf({ status: 'active' }) });
    mockProfile.giveAdultConsent.mockResolvedValue({ ok: true, member_id: 'm1' });
    mockRefresh.mockResolvedValue(null);
    await renderRouter(routes, { initialUrl: '/adult-consent' });
    await fireEvent.press(await screen.findByRole('button', { name: 'Accept' }));
    expect(await screen.findByText('Saved. Reconnecting…')).toBeTruthy();
    expect(screen).toHavePathname('/adult-consent');
  });

  it('stays on the screen and shows the message when consent fails', async () => {
    mockProfile.myProfile.mockResolvedValue({ ok: true, profile: profileOf({ status: 'active' }) });
    mockProfile.giveAdultConsent.mockResolvedValue({
      ok: false,
      kind: 'offline',
      message: 'No internet connection.',
    });
    await renderRouter(routes, { initialUrl: '/adult-consent' });
    await fireEvent.press(await screen.findByRole('button', { name: 'Accept' }));
    expect(await screen.findByText('No internet connection.')).toBeTruthy();
    expect(screen).toHavePathname('/adult-consent');
  });
});
