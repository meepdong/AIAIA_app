import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { elevationStyle } from '../internal/interactive';
import { useTheme } from '../theme';
import type { ElevationKey } from '../tokens';

export type CardProps = {
  children: ReactNode;
  elevation?: ElevationKey;
  style?: StyleProp<ViewStyle>;
};

/** A 1 px divider outline and no resting shadow; pass `elevation` to raise it. */
export function Card({ children, elevation, style }: CardProps) {
  const { colors, scheme, tokens } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: tokens.radius.lg,
          borderWidth: 1,
          borderColor: colors.divider,
          padding: tokens.spacing[4],
        },
        elevation ? elevationStyle(elevation, scheme) : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}
