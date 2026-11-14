import type { Api } from '@aiaia/api';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import OtpRoute from '../../../app/(auth)/otp';
import PhoneRoute from '../../../app/(auth)/phone';
import { setPendingPhone } from './pending-phone';
import { ApiProvider } from './useApi';

jest.mock('@/lib/supabase', () => ({
  getSupabase: () => {
    throw new Error('screens must go through useApi, not the Supabase client');
  },
}));
// The footer reads app_settings through the Supabase client; it is not under test here.
jest.mock('@/features/public', () => ({ PublicFooter: () => null }));

const PHONE = '+919000000001';
const mockAuth = {
  requestCode: jest.fn(),
  verifyCode: jest.fn(),
  signOut: jest.fn(),
  onSession: jest.fn(),
};
const api = { auth: mockAuth, _client: {} } as unknown as Api;

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
  '(auth)/phone': wrap(PhoneRoute),
  '(auth)/otp': wrap(OtpRoute),
};

beforeEach(() => {
  jest.useRealTimers();
  Object.values(mockAuth).forEach((m) => m.mockReset());
  mockAuth.requestCode.mockResolvedValue({ ok: true });
  mockAuth.verifyCode.mockResolvedValue({ ok: true });
  setPendingPhone(null);
});

describe('phone screen', () => {
  it('rejects a number that is too short, without calling the API', async () => {
    await renderRouter(routes, { initialUrl: '/phone' });
    await fireEvent.changeText(screen.getByLabelText('Mobile number'), '90000');
    await fireEvent.press(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByText('Enter a valid 10-digit mobile number.')).toBeTruthy();
    expect(mockAuth.requestCode).not.toHaveBeenCalled();
    expect(screen).toHavePathname('/phone');
  });

  it('rejects a number that does not start with 6-9', async () => {
    await renderRouter(routes, { initialUrl: '/phone' });
    await fireEvent.changeText(screen.getByLabelText('Mobile number'), '1234567890');
    await fireEvent.press(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByText('Enter a valid 10-digit mobile number.')).toBeTruthy();
    expect(mockAuth.requestCode).not.toHaveBeenCalled();
  });

  it('requests a code for +91 and the number, then opens the OTP screen', async () => {
    await renderRouter(routes, { initialUrl: '/phone' });
    expect(screen.getByText('+91', { includeHiddenElements: true })).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Mobile number'), '9000000001');
    await fireEvent.press(screen.getByRole('button', { name: 'Send code' }));
    await waitFor(() => expect(screen).toHavePathname('/otp'));
    expect(mockAuth.requestCode).toHaveBeenCalledTimes(1);
    expect(mockAuth.requestCode).toHaveBeenCalledWith(PHONE);
    // The number is not put in the URL.
    expect(screen).toHaveSearchParams({});
  });

  it('shows the friendly error and stays put when the request fails', async () => {
    mockAuth.requestCode.mockResolvedValue({
      ok: false,
      kind: 'rate_limited',
      message: 'Too many codes requested. Try again in 12 minutes.',
    });
    await renderRouter(routes, { initialUrl: '/phone' });
    await fireEvent.changeText(screen.getByLabelText('Mobile number'), '9000000001');
    await fireEvent.press(screen.getByRole('button', { name: 'Send code' }));
    expect(
      await screen.findByText('Too many codes requested. Try again in 12 minutes.'),
    ).toBeTruthy();
    expect(screen).toHavePathname('/phone');
  });
});

describe('otp screen', () => {
  const open = async () => {
    setPendingPhone(PHONE);
    await renderRouter(routes, { initialUrl: '/otp' });
    return screen.getByTestId('otp-input');
  };

  it('shows the formatted number', async () => {
    await open();
    expect(await screen.findByText(/\+91 90000 00001/)).toBeTruthy();
  });

  it('auto-submits as soon as the sixth digit is in', async () => {
    const input = await open();
    await fireEvent.changeText(input, '12345');
    expect(mockAuth.verifyCode).not.toHaveBeenCalled();
    await fireEvent.changeText(input, '123456');
    await waitFor(() => expect(mockAuth.verifyCode).toHaveBeenCalledTimes(1));
    expect(mockAuth.verifyCode).toHaveBeenCalledWith(PHONE, '123456');
  });

  it('shows the wrong-code error and clears the boxes for a retry', async () => {
    mockAuth.verifyCode.mockResolvedValue({
      ok: false,
      kind: 'wrong_code',
      message: 'That code is incorrect or has expired. Check the digits, or ask for a new code.',
    });
    const input = await open();
    await fireEvent.changeText(input, '000000');
    expect(await screen.findByText(/That code is incorrect or has expired/)).toBeTruthy();
    expect(screen.getByTestId('otp-input').props.value).toBe('');
  });

  it('shows the 429 message with the minutes', async () => {
    mockAuth.verifyCode.mockResolvedValue({
      ok: false,
      kind: 'rate_limited',
      message: 'Too many codes requested. Try again in 7 minutes.',
      retryAfterMinutes: 7,
    });
    const input = await open();
    await fireEvent.changeText(input, '123456');
    expect(
      await screen.findByText('Too many codes requested. Try again in 7 minutes.'),
    ).toBeTruthy();
  });

  it('counts down 30 seconds before resend, then resends and restarts', async () => {
    jest.useFakeTimers();
    setPendingPhone(PHONE);
    await renderRouter(routes, { initialUrl: '/otp' });
    expect(screen.getByRole('button', { name: 'Resend code in 30s' })).toBeDisabled();

    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    expect(screen.getByRole('button', { name: 'Resend code in 20s' })).toBeDisabled();

    await act(async () => {
      jest.advanceTimersByTime(20_000);
    });
    const resend = screen.getByRole('button', { name: 'Resend code' });
    expect(resend).toBeEnabled();

    await fireEvent.press(resend);
    expect(mockAuth.requestCode).toHaveBeenCalledWith(PHONE);
    expect(await screen.findByRole('button', { name: 'Resend code in 30s' })).toBeDisabled();
  });

  it('"Change number" goes back to the phone screen', async () => {
    await open();
    await fireEvent.press(screen.getByRole('button', { name: 'Change number' }));
    await waitFor(() => expect(screen).toHavePathname('/phone'));
  });

  it('sends the member back to /phone when there is no number in memory', async () => {
    await renderRouter(routes, { initialUrl: '/otp' });
    await waitFor(() => expect(screen).toHavePathname('/phone'));
  });
});
