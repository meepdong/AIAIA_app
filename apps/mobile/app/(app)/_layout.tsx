import { Tabs } from 'expo-router';
import { useSessionState } from '@/lib/session';

export default function MemberLayout() {
  // offline_active (no signal, see src/lib/session.tsx): only the pass, the scanner and the offline
  // screen exist; every other member route is unreachable until the server confirms again.
  const online = useSessionState() !== 'offline_active';
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Protected guard={online}>
        <Tabs.Screen name="home" options={{ title: 'Home' }} />
        <Tabs.Screen name="directory/index" options={{ title: 'Directory' }} />
        <Tabs.Screen name="events/index" options={{ title: 'Events' }} />
        <Tabs.Screen name="events/[id]" options={{ tabBarButton: () => null }} />
        <Tabs.Screen name="events/duties" options={{ tabBarButton: () => null }} />
        <Tabs.Screen name="profile/index" options={{ title: 'Profile' }} />
        <Tabs.Screen name="profile/family" options={{ tabBarButton: () => null }} />
        <Tabs.Screen name="_dev/ui-gallery" options={{ tabBarButton: () => null }} />
      </Tabs.Protected>
      <Tabs.Protected guard={!online}>
        <Tabs.Screen name="offline" options={{ title: 'Offline' }} />
      </Tabs.Protected>
      <Tabs.Screen name="pass/index" options={{ tabBarButton: () => null }} />
      <Tabs.Screen name="checkin/[id]" options={{ tabBarButton: () => null }} />
    </Tabs>
  );
}
