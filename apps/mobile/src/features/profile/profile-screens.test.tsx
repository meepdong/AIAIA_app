import type { Api } from '@aiaia/api';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ClaimRoute from '../../../app/(auth)/claim';
import ProfileSetupRoute from '../../../app/(auth)/profile-setup';
import { ApiProvider } from '@/features/auth/useApi';
import { todayIst } from './age';
import { emptyDraft } from './form';

jest.mock('@/lib/supabase', () => ({
  getSupabase: () => {
    throw new Error('screens must go through useApi, not the Supabase client');
  },
}));

const mockStore = {
  load: jest.fn(),
  save: jest.fn(),
  clear: jest.fn(),
};
jest.mock('./draft-store', () => ({
  loadDraft: (...args: unknown[]) => mockStore.load(...args),
  saveDraft: (...args: unknown[]) => mockStore.save(...args),
  clearDraft: (...args: unknown[]) => mockStore.clear(...args),
}));

const BRANCH = '00000000-0000-4000-8000-000000000001';
const mockProfile = {
  userId: jest.fn(),
  submitApplication: jest.fn(),
  graduateDependent: jest.fn(),
  refreshSession: jest.fn(),
};
const mockDirectory = { branches: jest.fn() };
const api = { profile: mockProfile, directory: mockDirectory, _client: {} } as unknown as Api;

function wrap(Route: () => React.JSX.Element | null) {
  return function Wrapped() {
    return (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 800 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <ApiProvider api={api}>
          <Route />
        </ApiProvider>
      </SafeAreaProvider>
    );
  };
}

const routes = {
  index: () => null,
  '(auth)/profile-setup': wrap(ProfileSetupRoute),
  '(auth)/claim': wrap(ClaimRoute),
  '(auth)/waiting-room': () => null,
  '(auth)/phone': () => null,
};

/** A date of birth that is exactly `years` old today (IST) plus `extraDays` days younger. */
function dobFor(
  years: number,
  extraDays = 0,
): { iso: string; day: string; month: string; year: string } {
  const [y, m, d] = todayIst().split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y - years, m - 1, d + extraDays));
  const pad = (n: number) => String(n).padStart(2, '0');
  const parts = {
    day: pad(date.getUTCDate()),
    month: pad(date.getUTCMonth() + 1),
    year: String(date.getUTCFullYear()),
  };
  return { iso: `${parts.year}-${parts.month}-${parts.day}`, ...parts };
}

async function typeDob(dob: { day: string; month: string; year: string }) {
  await fireEvent.changeText(screen.getByLabelText('Date of birth, day'), dob.day);
  await fireEvent.changeText(screen.getByLabelText('Date of birth, month'), dob.month);
  await fireEvent.changeText(screen.getByLabelText('Date of birth, year'), dob.year);
}

async function pickBranch() {
  await fireEvent.press(screen.getByRole('button', { name: /^Branch,/ }));
  await fireEvent.press(await screen.findByRole('radio', { name: 'Pune Branch' }));
}

const next = () => fireEvent.press(screen.getByRole('button', { name: 'Next' }));

beforeEach(() => {
  Object.values(mockStore).forEach((m) => m.mockReset());
  Object.values(mockProfile).forEach((m) => m.mockReset());
  mockDirectory.branches.mockReset();
  mockStore.load.mockResolvedValue(null);
  mockProfile.userId.mockResolvedValue('user-1');
  mockProfile.refreshSession.mockResolvedValue(undefined);
  mockDirectory.branches.mockResolvedValue([{ id: BRANCH, name: 'Pune Branch' }]);
});

describe('profile setup screen', () => {
  it('blocks a 13 year 364 day old with "ask a parent or guardian to add you"', async () => {
    await renderRouter(routes, { initialUrl: '/profile-setup' });
    await fireEvent.changeText(await screen.findByLabelText('Full name'), 'Aarav Testwala');
    await pickBranch();
    await typeDob(dobFor(14, 1));
    expect(await screen.findAllByText('Ask a parent or guardian to add you.')).not.toHaveLength(0);
    await next();
    expect(screen.getByText('Step 1 of 4: About you')).toBeTruthy();
  });

  it('lets a 14 year old continue and shows the guardian note', async () => {
    await renderRouter(routes, { initialUrl: '/profile-setup' });
    await fireEvent.changeText(await screen.findByLabelText('Full name'), 'Aarav Testwala');
    await pickBranch();
    await typeDob(dobFor(14));
    expect(
      await screen.findByText('Your branch will confirm a parent or guardian agrees.'),
    ).toBeTruthy();
    await next();
    expect(await screen.findByText('Step 2 of 4: Contact & work')).toBeTruthy();
  });

  it('shows the parent-organisation note at 35', async () => {
    await renderRouter(routes, { initialUrl: '/profile-setup' });
    await screen.findByLabelText('Full name');
    await typeDob(dobFor(35));
    expect(
      await screen.findByText("You'll join as an AIAIA member (parent organisation)."),
    ).toBeTruthy();
  });

  it('restores a saved draft, including the step', async () => {
    mockStore.load.mockResolvedValue({ ...emptyDraft(), step: 1, city: 'Pune' });
    await renderRouter(routes, { initialUrl: '/profile-setup' });
    expect(await screen.findByText('Step 2 of 4: Contact & work')).toBeTruthy();
    expect(screen.getByLabelText('City').props.value).toBe('Pune');
    expect(mockStore.load).toHaveBeenCalledWith('user-1');
  });

  it('saves the draft as the applicant types', async () => {
    await renderRouter(routes, { initialUrl: '/profile-setup' });
    await fireEvent.changeText(await screen.findByLabelText('Full name'), 'Aarav Testwala');
    expect(mockStore.save).toHaveBeenLastCalledWith(
      'user-1',
      expect.objectContaining({ fullName: 'Aarav Testwala', step: 0 }),
    );
  });

  it('submits the application, clears the draft and lands in the waiting room', async () => {
    const dob = dobFor(20);
    mockStore.load.mockResolvedValue({
      ...emptyDraft(),
      step: 3,
      fullName: 'Aarav Testwala',
      branchId: BRANCH,
      dob: dob.iso,
    });
    mockProfile.submitApplication.mockResolvedValue({ ok: true, member_id: 'm1' });
    await renderRouter(routes, { initialUrl: '/profile-setup' });
    await fireEvent.press(await screen.findByRole('button', { name: 'Submit application' }));
    expect(mockProfile.submitApplication).toHaveBeenCalledWith(
      expect.objectContaining({
        full_name: 'Aarav Testwala',
        dob: dob.iso,
        branch_id: BRANCH,
        whatsapp_opt_in: false,
        email_updates_opt_in: false,
      }),
    );
    expect(mockStore.clear).toHaveBeenCalled();
    expect(mockProfile.refreshSession).toHaveBeenCalled();
    await waitFor(() => expect(screen).toHavePathname('/waiting-room'));
    expect(screen).toHavePathname('/waiting-room');
  });

  it('shows the friendly text when a guardian link locks the date of birth', async () => {
    mockStore.load.mockResolvedValue({
      ...emptyDraft(),
      step: 3,
      fullName: 'Aarav Testwala',
      branchId: BRANCH,
      dob: dobFor(16).iso,
    });
    mockProfile.submitApplication.mockResolvedValue({
      ok: false,
      kind: 'dob_locked',
      message: "Your date of birth can't be changed here while a guardian is linked.",
    });
    await renderRouter(routes, { initialUrl: '/profile-setup' });
    await fireEvent.press(await screen.findByRole('button', { name: 'Submit application' }));
    expect(await screen.findByText(/can't be changed here/)).toBeTruthy();
    expect(mockStore.clear).not.toHaveBeenCalled();
    expect(screen).toHavePathname('/profile-setup');
  });

  it('keeps the email optional, with the helper text', async () => {
    mockStore.load.mockResolvedValue({ ...emptyDraft(), step: 1 });
    await renderRouter(routes, { initialUrl: '/profile-setup' });
    expect(await screen.findByText('For receipts and updates; you can add it later')).toBeTruthy();
  });

  it('offers the family-code claim screen', async () => {
    await renderRouter(routes, { initialUrl: '/profile-setup' });
    await fireEvent.press(await screen.findByText('Have a family code?'));
    expect(await screen.findByText('Family code')).toBeTruthy();
    expect(screen).toHavePathname('/claim');
  });
});

describe('claim screen', () => {
  async function enter(code: string) {
    await renderRouter(routes, { initialUrl: '/claim' });
    await fireEvent.changeText(await screen.findByLabelText('Family code'), code);
    await fireEvent.press(screen.getByRole('button', { name: 'Use this code' }));
  }

  it('keeps the button off until 8 characters are entered', async () => {
    await renderRouter(routes, { initialUrl: '/claim' });
    await fireEvent.changeText(await screen.findByLabelText('Family code'), 'ab3');
    expect(screen.getByRole('button', { name: 'Use this code' })).toBeDisabled();
    expect(mockProfile.graduateDependent).not.toHaveBeenCalled();
  });

  it('shows friendly text for a wrong code', async () => {
    mockProfile.graduateDependent.mockResolvedValue({
      ok: false,
      kind: 'invalid_code',
      message: 'That code is not valid or has expired.',
    });
    await enter('ab3def9h');
    expect(mockProfile.graduateDependent).toHaveBeenCalledWith('AB3DEF9H');
    expect(await screen.findByText('That code is not valid or has expired.')).toBeTruthy();
    expect(screen).toHavePathname('/claim');
  });

  it('shows friendly text after too many wrong codes (PT429)', async () => {
    mockProfile.graduateDependent.mockResolvedValue({
      ok: false,
      kind: 'rate_limited',
      message: 'Too many wrong codes. Please wait an hour.',
    });
    await enter('AB3DEF9H');
    expect(await screen.findByText('Too many wrong codes. Please wait an hour.')).toBeTruthy();
  });

  it('on success refreshes the session and moves on to the waiting room', async () => {
    mockProfile.graduateDependent.mockResolvedValue({
      ok: true,
      memberId: 'm9',
      status: 'pending',
      adultConsentRequired: false,
      guardianLinksEnded: false,
    });
    await enter('AB3DEF9H');
    await waitFor(() => expect(screen).toHavePathname('/waiting-room'));
    expect(mockProfile.refreshSession).toHaveBeenCalled();
    expect(screen).toHavePathname('/waiting-room');
  });
});
