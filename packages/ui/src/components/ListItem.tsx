import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { focusRing, minHit, type PressState } from '../internal/interactive';
import { useTheme } from '../theme';
import { Text } from './Text';

export type ListItemProps = {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Draws a hairline under the row. */
  divider?: boolean;
};

export function ListItem({
  title,
  subtitle,
  left,
  right,
  onPress,
  accessibilityLabel,
  divider,
}: ListItemProps) {
  const { colors, tokens } = useTheme();
  const body = (state: PressState) => (
    <View
      style={[
        minHit,
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: tokens.spacing[3],
          paddingVertical: tokens.spacing[2],
          paddingHorizontal: tokens.spacing[4],
          backgroundColor: state.hovered || state.pressed ? colors.surfaceAlt : 'transparent',
          borderBottomWidth: divider ? 1 : 0,
          borderBottomColor: colors.surfaceAlt,
        },
        state.focused && focusRing(colors.text),
      ]}
    >
      {left}
      <View style={{ flex: 1 }}>
        <Text>{title}</Text>
        {subtitle ? (
          <Text variant="label" tone="textMuted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
  if (!onPress) return body({ pressed: false });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)}
      onPress={onPress}
    >
      {body}
    </Pressable>
  );
}
