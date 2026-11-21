import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { AppProviders } from './AppProviders';

// The session provider loads the offline-access cache (P1-07b), whose native store uses AsyncStorage.
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// The session provider reaches the API layer, which would load the native storage modules.
jest.mock('@/lib/supabase', () => ({
  getSupabase: () => {
    throw new Error('no Supabase config in this test');
  },
}));

// SafeAreaProvider renders nothing until native metrics arrive; the library ships a mock.
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

describe('AppProviders', () => {
  it('renders children and mounts the toast live region once', async () => {
    await render(
      <AppProviders>
        <Text>child</Text>
      </AppProviders>,
    );
    expect(screen.getByText('child')).toBeTruthy();
    const liveRegions = JSON.stringify(screen.toJSON()).match(
      /"accessibilityLiveRegion":"polite"/g,
    );
    expect(liveRegions).toHaveLength(1);
  });
});
