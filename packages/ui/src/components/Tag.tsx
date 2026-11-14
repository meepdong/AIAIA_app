import { Pressable, View } from 'react-native';
import { focusRing, minHit, type PressState } from '../internal/interactive';
import { useTheme } from '../theme';
import { Text } from './Text';

export type TagProps = {
  label: string;
  selected?: boolean;
  /** Makes the tag a toggle. */
  onPress?: () => void;
  /** Shows a remove control. */
  onRemove?: () => void;
  accessibilityLabel?: string;
};

export function Tag({ label, selected, onPress, onRemove, accessibilityLabel }: TagProps) {
  const { colors, tokens } = useTheme();
  const bg = selected ? colors.primary : colors.surfaceAlt;
  const fg = selected ? colors.onPrimary : colors.text;
  const chip = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: tokens.spacing[1],
        backgroundColor: bg,
        borderRadius: tokens.radius.full,
        paddingHorizontal: tokens.spacing[3],
        paddingVertical: tokens.spacing[1],
      }}
    >
      <Text variant="label" style={{ color: fg }}>
        {label}
      </Text>
      {onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${label}`}
          onPress={onRemove}
          hitSlop={tokens.spacing[3]}
          style={(state: PressState) => [
            { paddingHorizontal: tokens.spacing[1] },
            state.focused && focusRing(colors.text),
          ]}
        >
          <Text variant="label" style={{ color: fg }}>
            {'×'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
  if (!onPress) return chip;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={onPress}
      style={(state: PressState) => [
        minHit,
        { justifyContent: 'center', alignSelf: 'flex-start' },
        state.focused && focusRing(colors.text),
        state.hovered && { opacity: 0.85 },
      ]}
    >
      {chip}
    </Pressable>
  );
}
