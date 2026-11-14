import { act, screen } from '@testing-library/react-native';
import { Slot } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { Text } from 'react-native';
import { AuthGate } from './AuthGate';
import type { SessionState } from './session';

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

  it('does not show a member page to a signed-out visitor who deep-links to it', async () => {
    await renderRouter(ROUTES, { initialUrl: '/events' });
    await act(async () => mockSetState('signed_out'));
    expect(screen.queryByText('Events page')).toBeNull();
  });
});
