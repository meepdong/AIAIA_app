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

describe('AppProviders navigation theme', () => {
  it('passes our dark tokens to React Navigation', async () => {
    const { useTheme: useNavTheme } = jest.requireActual('expo-router') as {
      useTheme: () => { dark: boolean; colors: { background: string } };
    };
    const { tokens } = jest.requireActual('@aiaia/ui') as typeof import('@aiaia/ui');
    const rn = jest.requireActual('react-native') as { useColorScheme: () => string | null };
    const spy = jest.spyOn(rn, 'useColorScheme').mockReturnValue('dark');
    let seen: { dark: boolean; colors: { background: string } } | undefined;
    function Probe() {
      seen = useNavTheme();
      return <Text>probe</Text>;
    }
    await render(
      <AppProviders>
        <Probe />
      </AppProviders>,
    );
    spy.mockRestore();
    expect(seen?.dark).toBe(true);
    expect(seen?.colors.background).toBe(tokens.colors.dark.background);
  });
});
