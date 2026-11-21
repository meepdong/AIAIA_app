import '../global.css';
import { Figtree_400Regular } from '@expo-google-fonts/figtree/400Regular';
import { Figtree_500Medium } from '@expo-google-fonts/figtree/500Medium';
import { Figtree_600SemiBold } from '@expo-google-fonts/figtree/600SemiBold';
import { Figtree_700Bold } from '@expo-google-fonts/figtree/700Bold';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AuthGate } from '@/lib/AuthGate';
import { AppProviders } from '@/providers/AppProviders';

SplashScreen.preventAutoHideAsync().catch(() => {});

/** Never hold the app back for longer than this waiting for fonts. */
const FONT_WAIT_MS = 4000;

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
  });
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), FONT_WAIT_MS);
    return () => clearTimeout(t);
  }, []);

  // A font error or a slow load falls through to the system font rather than blocking the app.
  const ready = fontsLoaded || fontError !== null || timedOut;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  if (!ready) return null;

  return (
    <AppProviders>
      <StatusBar style="auto" />
      <AuthGate />
    </AppProviders>
  );
}
