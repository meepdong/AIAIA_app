import { Tabs } from 'expo-router';
import { useSessionState } from '@/lib/session';

/**
 * Pages that live under the tab bar without a tab of their own. A null href would make them
 * unreachable in this expo-router (they bounce to /home), and `tabBarButton: () => null` alone
 * leaves an empty slot in the bar, so the item is also taken out of the layout.
 */
const HIDDEN = { tabBarButton: () => null, tabBarItemStyle: { display: 'none' } } as const;

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
        <Tabs.Screen name="events/[id]" options={HIDDEN} />
        <Tabs.Screen name="events/duties" options={HIDDEN} />
        <Tabs.Screen name="profile/index" options={{ title: 'Profile' }} />
        <Tabs.Screen name="profile/family" options={HIDDEN} />
        <Tabs.Screen name="_dev/ui-gallery" options={HIDDEN} />
      </Tabs.Protected>
      <Tabs.Protected guard={!online}>
        <Tabs.Screen name="offline" options={{ title: 'Offline' }} />
      </Tabs.Protected>
      <Tabs.Screen name="pass/index" options={HIDDEN} />
      <Tabs.Screen name="checkin/[id]" options={HIDDEN} />
    </Tabs>
  );
}
