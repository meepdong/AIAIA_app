import type { ReactNode } from 'react';
import { Pressable, type PressableProps } from 'react-native';
import {
  focusRing,
  minHit,
  pressScale,
  stateOverlay,
  type PressState,
} from '../internal/interactive';
import { useTheme } from '../theme';

export type IconButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  /** Icon element. Pass any glyph or SVG; the button only supplies the target and states. */
  icon: ReactNode;
  /** Required: an icon alone says nothing to a screen reader. */
  accessibilityLabel: string;
};

/** Ghost-button rules on a 44 pt target. */
export function IconButton({ icon, disabled, accessibilityLabel, ...rest }: IconButtonProps) {
  const { colors, overlays, tokens } = useTheme();
  return (
    <Pressable
      {...rest}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      style={(state: PressState) => [
        minHit,
        {
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: tokens.radius.md,
          backgroundColor: 'transparent',
          opacity: disabled ? 0.5 : 1,
        },
        pressScale(state.pressed && !disabled),
        state.focused && focusRing(colors.focus),
      ]}
    >
      {(state: PressState) => (
        <>
          {disabled ? null : stateOverlay(state, overlays, tokens.radius.md)}
          {icon}
        </>
      )}
    </Pressable>
  );
}
