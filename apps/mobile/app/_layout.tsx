import '../global.css';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProviders } from '@/providers/AppProviders';
import { useSessionState } from '@/lib/session';

// Auth gate: the session state (real session + my_profile(), see src/lib/session.tsx) decides
// which route group is reachable.
function Gate() {
  const state = useSessionState();
  const ready = state !== 'loading';
  const isMember = state === 'active';
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={ready && !isMember}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={ready && isMember}>
        <Stack.Screen name="(app)" />
        <Stack.Screen name="(admin)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AppProviders>
      <StatusBar style="auto" />
      <Gate />
    </AppProviders>
  );
}
