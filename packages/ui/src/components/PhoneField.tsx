import { View } from 'react-native';
import { Text } from './Text';
import { TextField, type TextFieldProps } from './TextField';

export type PhoneFieldProps = Omit<
  TextFieldProps,
  'value' | 'onChangeText' | 'prefix' | 'label' | 'keyboardType' | 'maxLength'
> & {
  label?: string;
  /** The 10-digit national number, without the country code. */
  value: string;
  onChangeText: (national: string) => void;
  countryCode?: string;
};

/** Strips spaces, punctuation and a leading +91 / 91 / 0 (as pasted from a contact card). */
export function toNationalNumber(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length > 10) {
    if (digits.startsWith('91') && digits.length === 12) return digits.slice(2);
    if (digits.startsWith('0') && digits.length === 11) return digits.slice(1);
  }
  return digits.slice(0, 10);
}

/** India phone entry (+91 by default). The value is always the bare 10 digits. */
export function PhoneField({
  label = 'Mobile number',
  value,
  onChangeText,
  countryCode = '+91',
  ...rest
}: PhoneFieldProps) {
  return (
    <TextField
      autoComplete="tel-national"
      textContentType="telephoneNumber"
      {...rest}
      label={label}
      value={value}
      onChangeText={(text) => onChangeText(toNationalNumber(text))}
      keyboardType="phone-pad"
      inputMode="tel"
      maxLength={16}
      prefix={
        <View accessible={false} importantForAccessibility="no-hide-descendants">
          <Text tone="textMuted">{countryCode}</Text>
        </View>
      }
    />
  );
}
