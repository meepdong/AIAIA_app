import { DarkTheme, DefaultTheme } from 'expo-router';
import type { ColorPalette, ColorScheme } from '@aiaia/ui';

/**
 * React Navigation's default theme paints a light grey background and a blue tint, which show in
 * dark mode on the tab bar and on any screen without its own background. This maps our tokens onto
 * it. The `divider` token is the hairline for the tab bar's top edge (the quiet one, not `border`,
 * which is for form controls). Fonts come from the base theme.
 */
export function navigationTheme(scheme: ColorScheme, colors: ColorPalette): typeof DefaultTheme {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    dark: scheme === 'dark',
    colors: {
      ...base.colors,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.divider,
      primary: colors.primary,
      notification: colors.danger,
    },
  };
}
