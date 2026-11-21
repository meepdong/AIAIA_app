import raw from './tokens.json';

// The single source of truth is tokens.json: apps/mobile/tailwind.config.js reads the same file,
// so NativeWind class names and the TS object below can never drift apart.

export const COLOR_ROLES = [
  'primary',
  'onPrimary',
  'surface',
  'surfaceAlt',
  'text',
  'textMuted',
  'border',
  'success',
  'warning',
  'danger',
  'background',
  'divider',
  'neutral',
  'info',
  'infoMuted',
  'onInfoMuted',
  'successMuted',
  'onSuccessMuted',
  'warningMuted',
  'onWarningMuted',
  'dangerMuted',
  'onDangerMuted',
  'focus',
] as const;

export type ColorRole = (typeof COLOR_ROLES)[number];
export type ColorScheme = 'light' | 'dark';
export type ColorPalette = Record<ColorRole, string>;

export type TextVariant = keyof typeof raw.fontSize;
export type SpacingKey = keyof typeof raw.spacing;
export type RadiusKey = keyof typeof raw.radius;
export type ElevationKey = keyof typeof raw.elevation;
/** Font weights we ship a Figtree face for. React Native needs one family name per weight. */
export type FontWeightKey = keyof typeof raw.fontFamily;

export const tokens = {
  colors: raw.colors as Record<ColorScheme, ColorPalette>,
  spacing: raw.spacing,
  radius: raw.radius,
  fontSize: raw.fontSize,
  fontFamily: raw.fontFamily,
  /** `boxShadow` is the light-scheme shadow, `boxShadowDark` the dark one (it adds a hairline ring). */
  elevation: raw.elevation,
  /** Durations in ms and cubic-bezier control points. */
  motion: raw.motion,
  /** Smallest touch/click target, in points. */
  minHitArea: raw.minHitArea,
} as const;
