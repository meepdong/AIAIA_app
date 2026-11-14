import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { focusRing, noOutline } from '../internal/interactive';
import { useTheme } from '../theme';
import { Text } from './Text';

export const OTP_LENGTH = 6;

export type OtpFieldProps = {
  value?: string;
  onChangeText?: (code: string) => void;
  /** Called once with the full code as soon as all six digits are in. */
  onComplete?: (code: string) => void;
  error?: string;
  label?: string;
  disabled?: boolean;
  autoFocus?: boolean;
};

/** Keeps digits only and caps at six, so a pasted "123 456" or "G-123456" still works. */
export function sanitizeOtp(input: string): string {
  return input.replace(/\D/g, '').slice(0, OTP_LENGTH);
}

/**
 * Six boxes over ONE real text input. A single input is what makes paste and SMS autofill work:
 * the OS hands the whole code to one field, and we spread it across the boxes.
 */
export function OtpField({
  value,
  onChangeText,
  onComplete,
  error,
  label = 'Verification code',
  disabled,
  autoFocus,
}: OtpFieldProps) {
  const { colors, tokens } = useTheme();
  const [inner, setInner] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const code = sanitizeOtp(value ?? inner);

  const handleChange = (text: string) => {
    const next = sanitizeOtp(text);
    if (value === undefined) setInner(next);
    onChangeText?.(next);
    if (next.length === OTP_LENGTH && code.length !== OTP_LENGTH) onComplete?.(next);
  };

  return (
    <View style={{ gap: tokens.spacing[1] }}>
      <Text variant="label" bold>
        {label}
      </Text>
      <Pressable
        accessible={false}
        onPress={() => inputRef.current?.focus()}
        style={{ position: 'relative' }}
      >
        <View
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={{ flexDirection: 'row', gap: tokens.spacing[2] }}
        >
          {Array.from({ length: OTP_LENGTH }, (_, i) => {
            const active = focused && i === Math.min(code.length, OTP_LENGTH - 1);
            return (
              <View
                key={i}
                testID={`otp-box-${i}`}
                style={[
                  {
                    flex: 1,
                    minHeight: tokens.minHitArea + tokens.spacing[2],
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: active ? 2 : 1,
                    borderColor: error ? colors.danger : active ? colors.text : colors.border,
                    borderRadius: tokens.radius.md,
                    backgroundColor: colors.surface,
                  },
                ]}
              >
                <Text variant="heading">{code[i] ?? ''}</Text>
              </View>
            );
          })}
        </View>
        <TextInput
          ref={inputRef}
          testID="otp-input"
          value={code}
          onChangeText={handleChange}
          editable={!disabled}
          autoFocus={autoFocus}
          maxLength={OTP_LENGTH * 2}
          keyboardType="number-pad"
          inputMode="numeric"
          // Android SMS autofill, iOS one-time-code suggestion, and the web equivalent.
          autoComplete="sms-otp"
          textContentType="oneTimeCode"
          accessibilityLabel={label}
          accessibilityHint="Enter the 6 digit code"
          caretHidden
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              opacity: 0.02,
              color: 'transparent',
              ...noOutline,
            },
            focused && focusRing(colors.text),
          ]}
        />
      </Pressable>
      {error ? (
        <Text variant="label" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
