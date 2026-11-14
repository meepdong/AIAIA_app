import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { tokens, type ColorPalette, type ColorScheme } from './tokens';

type ThemeContextValue = { scheme: ColorScheme | null };

const ThemeContext = createContext<ThemeContextValue>({ scheme: null });

/**
 * Optional. Without it components follow the system colour scheme. The dev gallery uses it to
 * force light or dark side by side.
 */
export function ThemeProvider({ scheme, children }: { scheme: ColorScheme; children: ReactNode }) {
  const value = useMemo(() => ({ scheme }), [scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export type Theme = {
  scheme: ColorScheme;
  colors: ColorPalette;
  tokens: typeof tokens;
};

export function useTheme(): Theme {
  const forced = useContext(ThemeContext).scheme;
  const system = useColorScheme();
  const scheme: ColorScheme = forced ?? (system === 'dark' ? 'dark' : 'light');
  return useMemo(() => ({ scheme, colors: tokens.colors[scheme], tokens }), [scheme]);
}
