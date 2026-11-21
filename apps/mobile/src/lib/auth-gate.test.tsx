import { act, screen } from '@testing-library/react-native';
import { Slot, router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { Text } from 'react-native';
import { AuthGate } from './AuthGate';
import type { SessionState } from './session';
import MemberLayout from '../../app/(app)/_layout';

jest.mock('./large-secure-store', () => ({ LargeSecureStore: class {} }));

jest.mock('@/lib/supabase', () => ({
  getSupabase: () => {
    throw new Error('no Supabase client in this test');
  },
}));

// A controllable session state: starts 'loading', like a cold start or a page reload.
let mockState: SessionState = 'loading';
const mockListeners = new Set<() => void>();
function mockSetState(next: SessionState) {
  mockState = next;
  mockListeners.forEach((l) => l());
}
jest.mock('./session', () => {
  const actual = jest.requireActual('./session');
  const { useSyncExternalStore } = jest.requireActual('react');
  return {
    ...actual,
    useSessionState: () =>
      useSyncExternalStore(
        (l: () => void) => {
          mockListeners.add(l);
          return () => mockListeners.delete(l);
        },
        () => mockState,
      ),
  };
});

function page(label: string) {
  function Page() {
    return <Text>{label}</Text>;
  }
  return Page;
}
const ROUTES = {
  _layout: () => <AuthGate />,
  index: page('Index page'),
  '(auth)/_layout': () => <Slot />,
  '(auth)/phone': page('Phone page'),
  '(app)/_layout': () => <Slot />,
  '(app)/home': page('Home page'),
  '(app)/events/index': page('Events page'),
};

beforeEach(() => {
  mockState = 'loading';
  mockListeners.clear();
});

describe('AuthGate', () => {
  it('keeps a deep link to a member page once the session resolves to active', async () => {
    await renderRouter(ROUTES, { initialUrl: '/events' });
    expect(screen.getByLabelText('Loading')).toBeTruthy();
    await act(async () => mockSetState('active'));
    expect(await screen.findByText('Events page')).toBeTruthy();
    expect(screen).toHavePathname('/events');
  });

  describe('offline_active: the real member layout offers only the pass and the scanner', () => {
    // The member group with its real layout, so the restriction under test is the shipped one.
    const MEMBER_ROUTES = {
      _layout: () => <AuthGate />,
      index: page('Index page'),
      '(auth)/_layout': () => <Slot />,
      '(auth)/phone': page('Phone page'),
      '(app)/_layout': MemberLayout,
      '(app)/home': page('Home page'),
      '(app)/directory/index': page('Directory page'),
      '(app)/events/index': page('Events page'),
      '(app)/events/[id]': page('Event page'),
      '(app)/events/duties': page('Duties page'),
      '(app)/_dev/ui-gallery': page('Gallery page'),
      '(app)/offline': page('Offline page'),
      '(app)/pass/index': page('Pass page'),
      '(app)/checkin/[id]': page('Scanner page'),
      '(admin)/_layout': () => <Slot />,
      '(admin)/admin/index': page('Admin page'),
    };

    it.each([
      ['/pass', 'Pass page'],
      ['/checkin/e1', 'Scanner page'],
    ])('reaches %s', async (url, label) => {
      await renderRouter(MEMBER_ROUTES, { initialUrl: '/' });
      await act(async () => mockSetState('offline_active'));
      await act(async () => router.push(url as never));
      expect(await screen.findByText(label)).toBeTruthy();
    });

    it.each([
      ['/home', 'Home page'],
      ['/directory', 'Directory page'],
      ['/events', 'Events page'],
      ['/admin', 'Admin page'],
    ])('does not reach %s', async (url, label) => {
      await renderRouter(MEMBER_ROUTES, { initialUrl: '/' });
      await act(async () => mockSetState('offline_active'));
      await act(async () => router.push(url as never));
      expect(screen.queryByText(label)).toBeNull();
    });

    it('when active, home is reachable again and the offline screen is not', async () => {
      await renderRouter(MEMBER_ROUTES, { initialUrl: '/home' });
      await act(async () => mockSetState('active'));
      expect(await screen.findByText('Home page')).toBeTruthy();
      await act(async () => mockSetState('active'));
      expect(screen.queryByText('Offline page')).toBeNull();
    });
  });

  it('does not show a member page to a signed-out visitor who deep-links to it', async () => {
    await renderRouter(ROUTES, { initialUrl: '/events' });
    await act(async () => mockSetState('signed_out'));
    expect(screen.queryByText('Events page')).toBeNull();
  });
});
