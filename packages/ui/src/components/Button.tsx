import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  focusRing,
  minHit,
  onPrimaryOverlays,
  pressScale,
  stateOverlay,
  type PressState,
} from '../internal/interactive';
import { useTheme } from '../theme';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  title: string;
  variant?: ButtonVariant;
  loading?: boolean;
  fullWidth?: boolean;
  /** Shown before the title. */
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  title,
  variant = 'primary',
  loading = false,
  disabled,
  fullWidth,
  icon,
  onPress,
  accessibilityLabel,
  style,
  ...rest
}: ButtonProps) {
  const { colors, overlays, scheme, tokens } = useTheme();
  const inactive = Boolean(disabled) || loading;

  // No borders: the fill carries the shape. Secondary is a translucent neutral so it sits on any
  // background; danger is the muted red pair, as in the Astryx neutral theme.
  const palette = {
    primary: { bg: colors.primary, fg: colors.onPrimary, ring: colors.focus },
    secondary: { bg: overlays.fill, fg: colors.text, ring: colors.focus },
    ghost: { bg: 'transparent', fg: colors.text, ring: colors.focus },
    danger: { bg: colors.dangerMuted, fg: colors.onDangerMuted, ring: colors.danger },
  }[variant];

  return (
    <Pressable
      {...rest}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={inactive ? undefined : onPress}
      style={(state: PressState) => [
        minHit,
        {
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: tokens.spacing[2],
          paddingHorizontal: tokens.spacing[3],
          paddingVertical: tokens.spacing[2],
          borderRadius: tokens.radius.md,
          backgroundColor: palette.bg,
          opacity: disabled ? 0.5 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        pressScale(state.pressed && !inactive),
        state.focused && focusRing(palette.ring),
        style,
      ]}
    >
      {(state: PressState) => (
        <>
          {inactive
            ? null
            : stateOverlay(
                state,
                variant === 'primary' ? onPrimaryOverlays(scheme) : overlays,
                tokens.radius.md,
              )}
          {loading ? (
            <ActivityIndicator size="small" color={palette.fg} />
          ) : icon ? (
            <View>{icon}</View>
          ) : null}
          <Text variant="label" style={{ color: palette.fg }}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}
