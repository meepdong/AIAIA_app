import { Link, type Href } from 'expo-router';
import { View } from 'react-native';
import { Text, useTheme } from '@aiaia/ui';
import { LEGAL_PAGES } from './legal-pages';

/** Links to every public page. Shown on each public page and on the sign-in screen. */
export function PublicFooter() {
  const { colors, tokens } = useTheme();
  return (
    <View
      role="navigation"
      style={{
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingVertical: tokens.spacing[2],
        paddingHorizontal: tokens.spacing[4],
        gap: tokens.spacing[1],
      }}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: tokens.spacing[4] }}>
        {LEGAL_PAGES.map((page) => (
          <Link
            key={page.slug}
            href={`/${page.slug}` as Href}
            accessibilityRole="link"
            style={{
              color: colors.primary,
              fontSize: tokens.fontSize.label.size,
              minHeight: tokens.minHitArea,
              lineHeight: tokens.minHitArea,
            }}
          >
            {page.label}
          </Link>
        ))}
      </View>
      <Text variant="caption" tone="textMuted">
        AIAIA Youth App
      </Text>
    </View>
  );
}
