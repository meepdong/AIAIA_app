import { Tabs } from 'expo-router';

export default function MemberLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="directory/index" options={{ title: 'Directory' }} />
      <Tabs.Screen name="events/index" options={{ title: 'Events' }} />
      <Tabs.Screen name="events/[id]" options={{ href: null }} />
      <Tabs.Screen name="events/duties" options={{ href: null }} />
      <Tabs.Screen name="profile/index" options={{ title: 'Profile' }} />
      <Tabs.Screen name="profile/family" options={{ href: null }} />
      <Tabs.Screen name="_dev/ui-gallery" options={{ href: null }} />
    </Tabs>
  );
}
