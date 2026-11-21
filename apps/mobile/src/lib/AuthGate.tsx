import { Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useSessionState } from './session';

// Auth gate: the session state (real session + my_profile(), see ./session.tsx) decides which
// route group is reachable.
//
// While the state is still 'loading' the navigator is not mounted at all. Mounting it with every
// guard false would make the router drop the requested URL (a reload or deep link to /events) and
// fall back to the index, which then redirects to the home route. Mounting it only once the state
// is known keeps the requested route, and the guards then allow or refuse it.
export function AuthGate() {
  const state = useSessionState();
  if (state === 'loading') {
    return (
      <View
        accessibilityLabel="Loading"
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        <ActivityIndicator />
      </View>
    );
  }
  const isMember = state === 'active';
  // No signal, confirmed active within 7 days: the member group mounts, but its layout
  // (app/(app)/_layout.tsx) then offers only the pass, the scanner and the offline screen.
  const isOffline = state === 'offline_active';
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!isMember && !isOffline}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={isMember || isOffline}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={isMember}>
        <Stack.Screen name="(admin)" />
      </Stack.Protected>
    </Stack>
  );
}
