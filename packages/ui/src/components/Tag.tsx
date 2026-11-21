import { Pressable, View } from 'react-native';
import { focusRing, minHit, stateOverlay, type PressState } from '../internal/interactive';
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
  const { colors, overlays, tokens } = useTheme();
  const bg = selected ? colors.primary : overlays.fill;
  const fg = selected ? colors.onPrimary : colors.text;
  const chip = (state?: PressState) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: tokens.spacing[1],
        minHeight: tokens.spacing[5],
        backgroundColor: bg,
        borderRadius: tokens.radius.full,
        paddingHorizontal: tokens.spacing[2],
      }}
    >
      {state ? stateOverlay(state, overlays, tokens.radius.full) : null}
      <Text
        variant="caption"
        style={{
          color: fg,
          lineHeight: tokens.spacing[5],
          fontFamily: tokens.fontFamily['500'],
          fontWeight: '500',
        }}
      >
        {label}
      </Text>
      {onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${label}`}
          onPress={onRemove}
          hitSlop={tokens.spacing[3]}
          style={(s: PressState) => [
            { paddingHorizontal: tokens.spacing[1], borderRadius: tokens.radius.full },
            s.focused && focusRing(colors.focus),
          ]}
        >
          <Text variant="caption" style={{ color: fg, lineHeight: tokens.spacing[5] }}>
            {'×'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
  if (!onPress) {
    if (!onRemove) return chip();
    // The remove control is a real target: give the row a full 44 pt height.
    return (
      <View style={[minHit, { justifyContent: 'center', alignSelf: 'flex-start' }]}>{chip()}</View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={onPress}
      style={(state: PressState) => [
        minHit,
        { justifyContent: 'center', alignSelf: 'flex-start' },
        state.focused && focusRing(colors.focus),
      ]}
    >
      {(state: PressState) => chip(state)}
    </Pressable>
  );
}
