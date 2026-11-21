import { Modal, Pressable, View } from 'react-native';
import { elevationStyle } from '../internal/interactive';
import { useTheme } from '../theme';
import { Button } from './Button';
import { Text } from './Text';

export type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as a danger action. */
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive,
  loading,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { colors, overlays, scheme, tokens } = useTheme();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={loading ? undefined : onCancel}
      statusBarTranslucent
    >
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: tokens.spacing[4],
        }}
      >
        <Pressable
          testID="confirm-backdrop"
          accessible={false}
          importantForAccessibility="no"
          onPress={loading ? undefined : onCancel}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: overlays.scrim,
          }}
        />
        <View
          accessibilityViewIsModal
          accessibilityRole="alert"
          style={[
            {
              width: '100%',
              maxWidth: 420,
              backgroundColor: colors.surface,
              borderRadius: tokens.radius.lg,
              padding: tokens.spacing[5],
              gap: tokens.spacing[3],
            },
            elevationStyle('lg', scheme),
          ]}
        >
          <Text variant="heading">{title}</Text>
          {message ? <Text tone="textMuted">{message}</Text> : null}
          <View
            style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: tokens.spacing[2] }}
          >
            <Button title={cancelLabel} variant="ghost" onPress={onCancel} disabled={loading} />
            <Button
              title={confirmLabel}
              variant={destructive ? 'danger' : 'primary'}
              onPress={onConfirm}
              loading={loading}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
