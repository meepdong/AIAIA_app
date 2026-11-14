import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { focusRing, minHit, type PressState } from '../internal/interactive';
import { useTheme } from '../theme';
import { Sheet } from './Sheet';
import { Text } from './Text';

export type SelectOption<T extends string = string> = { label: string; value: T };

export type SelectProps<T extends string = string> = {
  label: string;
  options: readonly SelectOption<T>[];
  value: T | null | undefined;
  onChange: (value: T) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
};

/** Single choice from a short list, picked in a bottom sheet (works the same on Android and web). */
export function Select<T extends string = string>({
  label,
  options,
  value,
  onChange,
  placeholder = 'Select',
  hint,
  error,
  disabled,
  accessibilityLabel,
}: SelectProps<T>) {
  const { colors, tokens } = useTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <View style={{ gap: tokens.spacing[1] }}>
      <Text variant="label" bold>
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? `${label}, ${selected?.label ?? placeholder}`}
        accessibilityHint="Opens a list of choices"
        accessibilityState={{ disabled: Boolean(disabled), expanded: open }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={(state: PressState) => [
          minHit,
          {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderWidth: 1,
            borderColor: error ? colors.danger : colors.border,
            borderRadius: tokens.radius.md,
            backgroundColor: disabled ? colors.surfaceAlt : colors.surface,
            paddingHorizontal: tokens.spacing[3],
          },
          state.focused && focusRing(colors.text),
        ]}
      >
        <Text tone={selected ? 'text' : 'textMuted'}>{selected?.label ?? placeholder}</Text>
        <Text tone="textMuted">{'▾'}</Text>
      </Pressable>
      {error ? (
        <Text variant="label" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="label" tone="textMuted">
          {hint}
        </Text>
      ) : null}
      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        {options.map((option) => {
          const isSelected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ selected: isSelected, checked: isSelected }}
              onPress={() => {
                onChange(option.value);
                setOpen(false);
              }}
              style={(state: PressState) => [
                minHit,
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: tokens.spacing[2],
                  borderRadius: tokens.radius.md,
                  backgroundColor:
                    state.hovered || state.pressed ? colors.surfaceAlt : 'transparent',
                },
                state.focused && focusRing(colors.text),
              ]}
            >
              <Text bold={isSelected}>{option.label}</Text>
              {isSelected ? <Text>{'✓'}</Text> : null}
            </Pressable>
          );
        })}
      </Sheet>
    </View>
  );
}
