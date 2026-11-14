import '@shopify/flash-list/jestSetup';
import { ThemeProvider } from '@aiaia/ui';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { telUrl, whatsappUrl } from './contact';
import { DirectoryScreen } from './DirectoryScreen';

const mockRpc = jest.fn();
const mockOrder = jest.fn();
jest.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: () => ({ select: () => ({ order: (...a: unknown[]) => mockOrder(...a) }) }),
  }),
}));

const metrics = {
  frame: { x: 0, y: 0, width: 400, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function entry(over: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    full_name: 'Zoya Sampleton',
    branch_name: 'Testpur',
    city: 'Mockville',
    occupation: 'Designer',
    photo_path: null,
    phone: null,
    email: null,
    ...over,
  };
}

async function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider scheme="light">
        <QueryClientProvider client={client}>
          <DirectoryScreen />
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockOrder.mockResolvedValue({ data: [{ id: 'b1', name: 'Testpur' }], error: null });
});

describe('contact urls', () => {
  it('builds tel and wa.me links from an E.164 phone', () => {
    expect(telUrl('+91 90000 00011')).toBe('tel:+919000000011');
    expect(whatsappUrl('+919000000011')).toBe('https://wa.me/919000000011');
  });
});

describe('directory screen', () => {
  it('no contact buttons when phone is null', async () => {
    mockRpc.mockResolvedValue({ data: [entry()], error: null });
    await renderScreen();
    expect(await screen.findByText('Zoya Sampleton')).toBeTruthy();
    expect(screen.queryByLabelText('Call Zoya Sampleton')).toBeNull();
    expect(screen.queryByLabelText('WhatsApp Zoya Sampleton')).toBeNull();
    expect(screen.getByLabelText('Report Zoya Sampleton')).toBeTruthy();
  });

  it('shows call and WhatsApp when the RPC returns a phone', async () => {
    mockRpc.mockResolvedValue({ data: [entry({ phone: '+919000000011' })], error: null });
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText('Call Zoya Sampleton'));
    expect(open).toHaveBeenCalledWith('tel:+919000000011');
    await fireEvent.press(screen.getByLabelText('WhatsApp Zoya Sampleton'));
    expect(open).toHaveBeenCalledWith('https://wa.me/919000000011');
  });

  it('shows the card details, skipping hidden fields', async () => {
    mockRpc.mockResolvedValue({ data: [entry({ city: null })], error: null });
    await renderScreen();
    expect(await screen.findByText('Testpur · Designer')).toBeTruthy();
  });

  it('debounces the search before calling the RPC', async () => {
    jest.useFakeTimers();
    try {
      mockRpc.mockResolvedValue({ data: [], error: null });
      await renderScreen();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(400);
      });
      mockRpc.mockClear();
      await fireEvent.changeText(screen.getByLabelText('Search members'), 'zo');
      await fireEvent.changeText(screen.getByLabelText('Search members'), 'zoya');
      await act(async () => {
        await jest.advanceTimersByTimeAsync(100);
      });
      expect(mockRpc).not.toHaveBeenCalled();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(400);
      });
      await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(1));
      expect(mockRpc).toHaveBeenCalledWith('search_directory', { q: 'zoya', page: 1 });
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows an empty state when nothing matches', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await renderScreen();
    expect(await screen.findByText('No members to show yet')).toBeTruthy();
  });

  it('shows an error state with a retry', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('boom') });
    await renderScreen();
    expect(await screen.findByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();
  });

  it('shows the offline state while the request is paused', async () => {
    onlineManager.setOnline(false);
    try {
      mockRpc.mockResolvedValue({ data: [], error: null });
      await renderScreen();
      expect(await screen.findByText('You are offline')).toBeTruthy();
    } finally {
      onlineManager.setOnline(true);
    }
  });
});
