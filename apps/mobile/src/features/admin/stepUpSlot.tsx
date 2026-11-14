import { Text } from '@aiaia/ui';
import type { ComponentType } from 'react';
import { View } from 'react-native';

/**
 * The step-up slot. P1-12c calls `registerStepUpFlow` with its screen (trusted-device check
 * first, then the email code). Until then the placeholder shows.
 */
type StepUpFlow = ComponentType<{ onVerified: () => void }>;
let registered: StepUpFlow | null = null;

export function registerStepUpFlow(flow: StepUpFlow | null) {
  registered = flow;
}

export function StepUpSlot({ onVerified }: { onVerified: () => void }) {
  const Flow = registered;
  if (Flow) return <Flow onVerified={onVerified} />;
  return (
    <View style={{ padding: 24, gap: 8 }}>
      <Text variant="heading">Email verification required</Text>
      <Text tone="textMuted">
        This device has not been verified for admin access yet. The verification step is coming.
      </Text>
    </View>
  );
}
