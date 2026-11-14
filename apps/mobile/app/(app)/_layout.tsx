import { Tabs } from 'expo-router';

export default function MemberLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="directory/index" options={{ title: 'Directory' }} />
      <Tabs.Screen name="_dev/ui-gallery" options={{ href: null }} />
    </Tabs>
  );
}
