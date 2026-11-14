import type { ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { IconButton } from './IconButton';
import { Text } from './Text';
import { useTheme } from '../theme';

export type HeaderProps = {
  title: string;
  subtitle?: string;
  /** Shows a back button. */
  onBack?: () => void;
  backLabel?: string;
  /** Actions on the right (IconButton, Button). */
  right?: ReactNode;
};

export function Header({ title, subtitle, onBack, backLabel = 'Go back', right }: HeaderProps) {
  const { colors, tokens } = useTheme();
  // At large font scales one line clips the title; allow two.
  const titleLines = useWindowDimensions().fontScale > 1.3 ? 2 : 1;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: tokens.spacing[2],
        minHeight: 56,
        paddingHorizontal: tokens.spacing[4],
        paddingVertical: tokens.spacing[2],
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.surfaceAlt,
      }}
    >
      {onBack ? (
        <IconButton
          accessibilityLabel={backLabel}
          onPress={onBack}
          icon={<Text variant="heading">{'←'}</Text>}
        />
      ) : null}
      <View style={{ flex: 1 }}>
        <Text variant="heading" numberOfLines={titleLines}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="label" tone="textMuted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}
