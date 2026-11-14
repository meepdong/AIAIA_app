import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge, Screen, useTheme } from '@aiaia/ui';
import { LEGAL_MARKDOWN } from './legal-content.generated';
import { DRAFT_BANNER, type LegalSlug } from './legal-pages';
import { MarkdownView } from './MarkdownView';
import { PublicFooter } from './PublicFooter';
import { useLegalApproved } from './useLegalApproved';

/** One public page: DRAFT banner (until approved), the bundled document, then the shared footer. */
export function LegalPage({ slug, children }: { slug: LegalSlug; children?: ReactNode }) {
  const approved = useLegalApproved();
  const { colors, tokens } = useTheme();
  const source = LEGAL_MARKDOWN[slug] ?? '';
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={{ flex: 1 }}>
        <Screen>
          <View
            style={{ maxWidth: 720, width: '100%', alignSelf: 'center', gap: tokens.spacing[4] }}
          >
            {approved ? null : (
              <View accessibilityRole="alert">
                <Badge label={DRAFT_BANNER} tone="warning" />
              </View>
            )}
            <MarkdownView source={source} />
            {children}
          </View>
        </Screen>
      </View>
      <PublicFooter />
    </View>
  );
}
