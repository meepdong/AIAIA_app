import { createElement, type ReactElement } from 'react';
import {
  Platform,
  View,
  type PressableStateCallbackType,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import {
  tokens,
  type ColorPalette,
  type ColorScheme,
  type ElevationKey,
  type OverlayPalette,
} from '../tokens';

/** react-native-web adds hovered/focused to Pressable's state; native only has pressed. */
export type PressState = PressableStateCallbackType & { hovered?: boolean; focused?: boolean };

/** Visible keyboard focus ring (web; harmless on native). */
export function focusRing(color: string): ViewStyle {
  return { outlineWidth: 2, outlineColor: color, outlineOffset: 3, outlineStyle: 'solid' };
}

/**
 * Focused text control: the border takes the `focus` colour and a 2 px translucent ring is drawn
 * inside it. An error keeps its `danger` border. Needs no outline, so it works on native too.
 */
export function fieldFocusStyle(
  colors: ColorPalette,
  overlays: OverlayPalette,
  hasError = false,
): ViewStyle {
  return {
    borderColor: hasError ? colors.danger : colors.focus,
    boxShadow: `inset 0px 0px 0px 2px ${overlays.pressed}`,
  };
}

/**
 * Translucent hover/pressed paint, rendered as the first child of a control over its own fill.
 * Returns null at rest. The control passes its `radius` so the paint follows its corners.
 */
export function stateOverlay(
  state: PressState,
  overlays: OverlayPalette,
  radius: number,
): ReactElement | null {
  const color = state.pressed ? overlays.pressed : state.hovered ? overlays.hover : null;
  if (!color) return null;
  return createElement(View, {
    pointerEvents: 'none',
    style: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      borderRadius: radius,
      backgroundColor: color,
    },
  });
}

/**
 * Press scale (0.98) on web with a fine pointer only, and only when reduced motion is off.
 * Never on native or on touch screens.
 */
export function pressScale(pressed: boolean): ViewStyle | undefined {
  if (!pressed || Platform.OS !== 'web') return undefined;
  try {
    const win = globalThis as { matchMedia?: (q: string) => { matches: boolean } };
    const matches = (q: string) => win.matchMedia?.(q).matches === true;
    if (matches('(pointer: fine)') && !matches('(prefers-reduced-motion: reduce)')) {
      return { transform: [{ scale: 0.98 }] };
    }
  } catch {
    // matchMedia unavailable: skip the scale.
  }
  return undefined;
}

export function elevationStyle(level: ElevationKey, scheme: ColorScheme = 'light'): ViewStyle {
  const e = tokens.elevation[level];
  if (Platform.OS === 'android') return { elevation: e.android };
  return { boxShadow: scheme === 'dark' ? e.boxShadowDark : e.boxShadow };
}

/** Keeps a small visual control a full 44 pt target. */
export const minHit: ViewStyle = {
  minWidth: tokens.minHitArea,
  minHeight: tokens.minHitArea,
};

/** Removes the browser outline on a text input whose wrapper draws the focus ring (web only). */
export const noOutline = { outlineStyle: 'none' } as unknown as TextStyle;

/**
 * Overlays for a control filled with `colors.primary`. The normal overlays are black-alpha in light
 * and white-alpha in dark, which is invisible on a near-black or near-white fill. The other
 * scheme's overlays are the inverse sign at the same alpha steps.
 */
export function onPrimaryOverlays(scheme: ColorScheme): OverlayPalette {
  return tokens.overlays[scheme === 'dark' ? 'light' : 'dark'];
}
