import { useState, type ReactNode } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { focusRing, noOutline } from '../internal/interactive';
import { useTheme } from '../theme';
import { Text } from './Text';

export type TextFieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  hint?: string;
  error?: string;
  /** Rendered inside the box before the text (for example a country code). */
  prefix?: ReactNode;
};

/** Labelled input with hint and error text. Wire it to react-hook-form with a Controller. */
export function TextField({
  label,
  hint,
  error,
  prefix,
  accessibilityLabel,
  onFocus,
  onBlur,
  editable = true,
  ...rest
}: TextFieldProps) {
  const { colors, tokens } = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.danger : colors.border;
  return (
    <View style={{ gap: tokens.spacing[1] }}>
      <Text variant="label" bold>
        {label}
      </Text>
      <View
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: tokens.minHitArea,
            borderWidth: 1,
            borderColor,
            borderRadius: tokens.radius.md,
            backgroundColor: editable ? colors.surface : colors.surfaceAlt,
            paddingHorizontal: tokens.spacing[3],
            gap: tokens.spacing[2],
          },
          focused && focusRing(colors.text),
        ]}
      >
        {prefix}
        <TextInput
          {...rest}
          editable={editable}
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityHint={hint}
          accessibilityState={{ disabled: !editable }}
          placeholderTextColor={colors.textMuted}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={{
            flex: 1,
            minHeight: tokens.minHitArea,
            color: colors.text,
            fontSize: tokens.fontSize.body.size,
            paddingVertical: tokens.spacing[2],
            ...noOutline,
          }}
        />
      </View>
      {error ? (
        <Text variant="label" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="label" tone="textMuted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
