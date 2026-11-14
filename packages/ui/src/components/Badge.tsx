import { View } from 'react-native';
import { useTheme } from '../theme';
import { Text } from './Text';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger';

/** Small status marker (read-only). Use `Tag` for user-chosen or removable labels. */
export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const { colors, tokens } = useTheme();
  const accent = tone === 'neutral' ? colors.textMuted : colors[tone];
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        borderRadius: tokens.radius.full,
        borderWidth: 1,
        borderColor: accent,
        backgroundColor: colors.surface,
        paddingHorizontal: tokens.spacing[2],
        paddingVertical: 2,
      }}
    >
      <Text variant="caption" bold style={{ color: accent }}>
        {label}
      </Text>
    </View>
  );
}
