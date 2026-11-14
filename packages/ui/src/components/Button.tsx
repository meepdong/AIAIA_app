import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { focusRing, minHit, type PressState } from '../internal/interactive';
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
  const { colors, tokens } = useTheme();
  const inactive = Boolean(disabled) || loading;

  const palette = {
    primary: {
      bg: colors.primary,
      fg: colors.onPrimary,
      border: colors.primary,
      hover: colors.text,
    },
    danger: {
      bg: colors.danger,
      fg: colors.onPrimary,
      border: colors.danger,
      hover: colors.danger,
    },
    secondary: {
      bg: colors.surface,
      fg: colors.text,
      border: colors.border,
      hover: colors.surfaceAlt,
    },
    ghost: { bg: 'transparent', fg: colors.text, border: 'transparent', hover: colors.surfaceAlt },
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
          paddingHorizontal: tokens.spacing[4],
          paddingVertical: tokens.spacing[2],
          borderRadius: tokens.radius.md,
          borderWidth: 1,
          borderColor: palette.border,
          backgroundColor: state.hovered && variant !== 'primary' ? palette.hover : palette.bg,
          opacity: disabled
            ? 0.5
            : state.pressed
              ? 0.85
              : state.hovered && variant === 'primary'
                ? 0.92
                : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        state.focused && focusRing(colors.text),
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.fg} />
      ) : icon ? (
        <View>{icon}</View>
      ) : null}
      <Text bold style={{ color: palette.fg }}>
        {title}
      </Text>
    </Pressable>
  );
}
