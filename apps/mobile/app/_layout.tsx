import '../global.css';
import { StatusBar } from 'expo-status-bar';
import { AuthGate } from '@/lib/AuthGate';
import { AppProviders } from '@/providers/AppProviders';

export default function RootLayout() {
  return (
    <AppProviders>
      <StatusBar style="auto" />
      <AuthGate />
    </AppProviders>
  );
}
