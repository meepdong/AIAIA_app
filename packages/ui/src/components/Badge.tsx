import { View } from 'react-native';
import { useTheme } from '../theme';
import { Text } from './Text';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger';

/** Small status marker (read-only). Use `Tag` for user-chosen or removable labels. */
export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const { colors, overlays, tokens } = useTheme();
  const pair = {
    neutral: { bg: overlays.fill, fg: colors.text },
    success: { bg: colors.successMuted, fg: colors.onSuccessMuted },
    warning: { bg: colors.warningMuted, fg: colors.onWarningMuted },
    danger: { bg: colors.dangerMuted, fg: colors.onDangerMuted },
  }[tone];
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        justifyContent: 'center',
        minHeight: tokens.spacing[5],
        borderRadius: tokens.radius.full,
        backgroundColor: pair.bg,
        paddingHorizontal: tokens.spacing[2],
      }}
    >
      <Text
        variant="caption"
        style={{
          color: pair.fg,
          lineHeight: tokens.spacing[5],
          fontFamily: tokens.fontFamily['500'],
          fontWeight: '500',
        }}
      >
        {label}
      </Text>
    </View>
  );
}
