import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { useTheme } from '../theme';
import type { ColorRole, TextVariant } from '../tokens';

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  /** Colour role. Defaults to `text`. */
  tone?: Extract<ColorRole, 'text' | 'textMuted' | 'danger' | 'success' | 'warning' | 'onPrimary'>;
  bold?: boolean;
};

/** Themed text on the typography scale. Scales with the system font size (React Native default). */
export function Text({ variant = 'body', tone = 'text', bold, style, ...rest }: TextProps) {
  const { colors, tokens } = useTheme();
  const scale = tokens.fontSize[variant];
  const isHeading = variant === 'heading' || variant === 'title' || variant === 'display';
  return (
    <RNText
      accessibilityRole={isHeading ? 'header' : undefined}
      {...rest}
      style={[
        {
          color: colors[tone],
          fontSize: scale.size,
          lineHeight: scale.lineHeight,
          fontWeight: bold || isHeading ? '600' : '400',
        },
        style,
      ]}
    />
  );
}
