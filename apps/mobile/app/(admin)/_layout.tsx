import { Stack } from 'expo-router';

// Later briefs add the admin-permission guard and the super-admin step-up here.
export default function AdminLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
