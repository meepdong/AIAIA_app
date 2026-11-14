import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { useState, type ComponentType } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AboutRoute from '../../../app/(public)/about';
import ContactRoute from '../../../app/(public)/contact';
import DeleteAccountRoute from '../../../app/(public)/delete-account';
import DeliveryRoute from '../../../app/(public)/delivery';
import PricingRoute from '../../../app/(public)/pricing';
import PrivacyRoute from '../../../app/(public)/privacy';
import RefundsRoute from '../../../app/(public)/refunds';
import TermsRoute from '../../../app/(public)/terms';
import { DRAFT_BANNER, LEGAL_PAGES } from './legal-pages';
import { fetchLegalApproved } from './useLegalApproved';

const mockMaybeSingle = jest.fn();
jest.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }) }),
  }),
}));

const ROUTES: Record<string, ComponentType> = {
  about: AboutRoute,
  contact: ContactRoute,
  privacy: PrivacyRoute,
  terms: TermsRoute,
  refunds: RefundsRoute,
  delivery: DeliveryRoute,
  pricing: PricingRoute,
  'delete-account': DeleteAccountRoute,
};

function withProviders(Route: ComponentType): ComponentType {
  return function Wrapped() {
    const [client] = useState(
      () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    );
    return (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 800 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <QueryClientProvider client={client}>
          <Route />
        </QueryClientProvider>
      </SafeAreaProvider>
    );
  };
}

const routeMap = {
  index: () => null,
  ...Object.fromEntries(
    Object.entries(ROUTES).map(([slug, Route]) => [`(public)/${slug}`, withProviders(Route)]),
  ),
};

beforeEach(() => {
  mockMaybeSingle.mockReset();
  mockMaybeSingle.mockResolvedValue({ data: { value: false }, error: null });
});

describe('public pages', () => {
  it('has exactly the 8 required routes', () => {
    expect(LEGAL_PAGES.map((p) => p.slug).sort()).toEqual(Object.keys(ROUTES).sort());
  });

  it.each(LEGAL_PAGES.map((p) => [p.slug, p.heading] as const))(
    '/%s renders its heading, the draft banner and the footer',
    async (slug, heading) => {
      await renderRouter(routeMap, { initialUrl: `/${slug}` });
      expect(await screen.findByRole('header', { name: heading })).toBeTruthy();
      expect(await screen.findByText(DRAFT_BANNER)).toBeTruthy();
      for (const page of LEGAL_PAGES) {
        expect(screen.getAllByRole('link', { name: page.label }).length).toBeGreaterThan(0);
      }
    },
  );

  it('the footer navigates between pages', async () => {
    await renderRouter(routeMap, { initialUrl: '/about' });
    await fireEvent.press(await screen.findByRole('link', { name: 'Privacy' }));
    expect(await screen.findByRole('header', { name: 'Privacy Policy' })).toBeTruthy();
  });

  it('hides the banner once legal_approved is true', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { value: true }, error: null });
    await renderRouter(routeMap, { initialUrl: '/terms' });
    expect(await screen.findByRole('header', { name: 'Terms of Use' })).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(DRAFT_BANNER)).toBeNull());
  });

  it('delete-account offers a sign-in button', async () => {
    await renderRouter(routeMap, { initialUrl: '/delete-account' });
    expect(await screen.findByRole('button', { name: 'Sign in to delete' })).toBeTruthy();
  });

  it('privacy policy covers storage, retention, grievance and payments', async () => {
    await renderRouter(routeMap, { initialUrl: '/privacy' });
    for (const text of [
      /Mumbai/,
      /Bangalore/,
      /6 months/,
      /Grievance Officer/,
      /Razorpay/,
      /guardian/,
    ]) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    }
  });
});

describe('legal_approved is read defensively', () => {
  it.each([
    ['approved', { data: { value: true }, error: null }, true],
    ['false', { data: { value: false }, error: null }, false],
    ['missing row', { data: null, error: null }, false],
    ['null value', { data: { value: null }, error: null }, false],
    ['the string "true"', { data: { value: 'true' }, error: null }, false],
    ['an error', { data: null, error: { message: 'relation does not exist' } }, false],
  ])('%s', async (_name, result, expected) => {
    mockMaybeSingle.mockResolvedValue(result);
    expect(await fetchLegalApproved()).toBe(expected);
  });

  it('is false when the request throws', async () => {
    mockMaybeSingle.mockRejectedValue(new Error('offline'));
    expect(await fetchLegalApproved()).toBe(false);
  });
});
