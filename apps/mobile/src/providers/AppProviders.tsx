import { ToastHost, useTheme } from '@aiaia/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider as NavigationThemeProvider } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { navigationTheme } from '@/lib/navigation-theme';
import { SessionProvider } from '@/lib/session';

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } }),
  );
  const { scheme, colors } = useTheme();
  // Gives React Navigation (tab bar, footers, screen backgrounds) our colours in both schemes.
  const navTheme = useMemo(() => navigationTheme(scheme, colors), [scheme, colors]);
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <NavigationThemeProvider value={navTheme}>
          <SessionProvider>{children}</SessionProvider>
        </NavigationThemeProvider>
        {/* One app-wide host, so toast() works from any screen. */}
        <ToastHost />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
