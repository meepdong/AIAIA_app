import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { fieldFocusStyle, noOutline } from '../internal/interactive';
import { useTheme } from '../theme';
import { Text } from './Text';

export type DateFieldProps = {
  label: string;
  /** ISO calendar date `YYYY-MM-DD`, or empty string while incomplete. */
  value: string;
  /** Called with a valid ISO date, or '' while the entry is incomplete or not a real date. */
  onChange: (isoDate: string) => void;
  hint?: string;
  error?: string;
  disabled?: boolean;
};

const pad = (n: number, width: number) => String(n).padStart(width, '0');

/** Returns `YYYY-MM-DD` only for a real calendar date (so 31/02 is rejected), else ''. */
export function toIsoDate(day: string, month: string, year: string): string {
  if (day.length === 0 || month.length === 0 || year.length !== 4) return '';
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  const date = new Date(Date.UTC(y, m - 1, d));
  const real =
    date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  return real ? `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}` : '';
}

function splitIso(value: string): { day: string; month: string; year: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match
    ? { year: match[1] ?? '', month: match[2] ?? '', day: match[3] ?? '' }
    : { day: '', month: '', year: '' };
}

/**
 * Day / month / year boxes. Typing a date beats scrolling a picker for a date of birth, needs no
 * native module, and behaves the same on Android and web.
 */
export function DateField({ label, value, onChange, hint, error, disabled }: DateFieldProps) {
  const { colors, overlays, tokens } = useTheme();
  const [parts, setParts] = useState(() => splitIso(value));
  const [focusedKey, setFocusedKey] = useState<string | null>(null);

  // Follow the value when the parent sets it (form reset, loaded profile).
  if (value && value !== toIsoDate(parts.day, parts.month, parts.year)) {
    setParts(splitIso(value));
  }

  const complete = parts.day.length > 0 && parts.month.length > 0 && parts.year.length === 4;
  const invalid = complete && toIsoDate(parts.day, parts.month, parts.year) === '';
  const message = error ?? (invalid ? 'Enter a real date' : undefined);

  const update = (key: 'day' | 'month' | 'year', raw: string) => {
    const max = key === 'year' ? 4 : 2;
    const next = { ...parts, [key]: raw.replace(/\D/g, '').slice(0, max) };
    setParts(next);
    onChange(toIsoDate(next.day, next.month, next.year));
  };

  const box = (key: 'day' | 'month' | 'year', placeholder: string, flex: number) => (
    <View
      style={[
        {
          flex,
          minHeight: tokens.minHitArea,
          borderWidth: 1,
          borderColor: message ? colors.danger : colors.border,
          borderRadius: tokens.radius.md,
          backgroundColor: colors.surface,
          opacity: disabled ? 0.5 : 1,
          justifyContent: 'center',
        },
        focusedKey === key && fieldFocusStyle(colors, overlays, Boolean(message)),
      ]}
    >
      <TextInput
        value={parts[key]}
        onChangeText={(t) => update(key, t)}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        editable={!disabled}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={key === 'year' ? 4 : 2}
        accessibilityLabel={`${label}, ${key}`}
        onFocus={() => setFocusedKey(key)}
        onBlur={() => setFocusedKey(null)}
        style={{
          minHeight: tokens.minHitArea,
          textAlign: 'center',
          color: colors.text,
          fontSize: tokens.fontSize.body.size,
          ...noOutline,
        }}
      />
    </View>
  );

  return (
    <View accessibilityRole="none" style={{ gap: tokens.spacing[1] }}>
      <Text variant="label">{label}</Text>
      <View style={{ flexDirection: 'row', gap: tokens.spacing[2] }}>
        {box('day', 'DD', 1)}
        {box('month', 'MM', 1)}
        {box('year', 'YYYY', 1.6)}
      </View>
      {message ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {message}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="textMuted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
