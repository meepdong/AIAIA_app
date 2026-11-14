import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { AppProviders } from './AppProviders';

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
