import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useTheme } from '../theme';

export type ScreenProps = {
  children: ReactNode;
  /** Scrolls the content (default). Turn off for screens that manage their own list. */
  scroll?: boolean;
  /** Applies the standard page padding (default). */
  padded?: boolean;
  edges?: readonly Edge[];
  contentStyle?: ViewStyle;
};

/** Safe area + optional scroll + keyboard avoiding, on the theme background. */
export function Screen({
  children,
  scroll = true,
  padded = true,
  edges,
  contentStyle,
}: ScreenProps) {
  const { colors, tokens } = useTheme();
  const padding: ViewStyle = padded ? { padding: tokens.spacing[4], gap: tokens.spacing[4] } : {};
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {scroll ? (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[{ flexGrow: 1 }, padding, contentStyle]}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[{ flex: 1 }, padding, contentStyle]}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
