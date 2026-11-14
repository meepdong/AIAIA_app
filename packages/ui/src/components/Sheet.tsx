import type { ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { elevationStyle } from '../internal/interactive';
import { useTheme } from '../theme';
import { Text } from './Text';

export type SheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
};

/** Bottom sheet. Tapping the dimmed area, or Android back, closes it. */
export function Sheet({ visible, onClose, title, children }: SheetProps) {
  const { colors, tokens } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessible={false}
          importantForAccessibility="no"
          onPress={onClose}
          style={{ ...absoluteFill, backgroundColor: 'rgba(0,0,0,0.5)' }}
        />
        <View
          accessibilityViewIsModal
          style={[
            {
              maxHeight: '80%',
              backgroundColor: colors.surface,
              borderTopLeftRadius: tokens.radius.lg,
              borderTopRightRadius: tokens.radius.lg,
              padding: tokens.spacing[4],
              paddingBottom: tokens.spacing[4] + insets.bottom,
              gap: tokens.spacing[3],
            },
            elevationStyle('lg'),
          ]}
        >
          {title ? <Text variant="heading">{title}</Text> : null}
          <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const absoluteFill = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;
