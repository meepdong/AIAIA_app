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

export function Card({ children, elevation = 'sm', style }: CardProps) {
  const { colors, tokens } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: tokens.radius.lg,
          borderWidth: 1,
          borderColor: colors.surfaceAlt,
          padding: tokens.spacing[4],
        },
        elevationStyle(elevation),
        style,
      ]}
    >
      {children}
    </View>
  );
}
