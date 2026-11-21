import { act, render, screen } from '@testing-library/react-native';
import { useFonts } from 'expo-font';
import RootLayout from '../../app/_layout';

jest.mock('../../global.css', () => ({}), { virtual: true });
jest.mock('expo-font', () => ({ useFonts: jest.fn() }));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: () => Promise.resolve(),
  hideAsync: () => Promise.resolve(),
}));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('@/lib/AuthGate', () => {
  const { Text: T } = jest.requireActual('react-native');
  return { AuthGate: () => <T>App content</T> };
});
jest.mock('@/providers/AppProviders', () => ({
  AppProviders: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockUseFonts = useFonts as unknown as jest.Mock;

describe('root layout font loading', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('renders nothing while fonts load, then the app once the 4 s wait is over', async () => {
    mockUseFonts.mockReturnValue([false, null]);
    await render(<RootLayout />);
    expect(screen.queryByText('App content')).toBeNull();
    await act(async () => jest.advanceTimersByTime(3999));
    expect(screen.queryByText('App content')).toBeNull();
    await act(async () => jest.advanceTimersByTime(1));
    expect(screen.getByText('App content')).toBeTruthy();
  });

  it('renders the app straight away when the fonts fail to load', async () => {
    mockUseFonts.mockReturnValue([false, new Error('font failed')]);
    await render(<RootLayout />);
    expect(screen.getByText('App content')).toBeTruthy();
  });

  it('renders the app straight away once the fonts are loaded', async () => {
    mockUseFonts.mockReturnValue([true, null]);
    await render(<RootLayout />);
    expect(screen.getByText('App content')).toBeTruthy();
  });
});
