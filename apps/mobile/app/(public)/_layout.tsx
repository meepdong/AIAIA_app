import { Stack } from 'expo-router';

// Public pages: reachable without signing in (they sit outside the auth gate's protected groups).
export default function PublicLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
