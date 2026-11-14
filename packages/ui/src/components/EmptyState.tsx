import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme';
import { Button } from './Button';
import { Text } from './Text';

export type EmptyStateProps = {
  title: string;
  message?: string;
  icon?: ReactNode;
  action?: { label: string; onPress: () => void };
};

export function EmptyState({ title, message, icon, action }: EmptyStateProps) {
  const { tokens } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={message ? `${title}. ${message}` : title}
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        gap: tokens.spacing[2],
        padding: tokens.spacing[6],
      }}
    >
      {icon}
      <Text variant="heading" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      {message ? (
        <Text tone="textMuted" style={{ textAlign: 'center' }}>
          {message}
        </Text>
      ) : null}
      {action ? (
        <View style={{ marginTop: tokens.spacing[2] }}>
          <Button title={action.label} onPress={action.onPress} />
        </View>
      ) : null}
    </View>
  );
}
