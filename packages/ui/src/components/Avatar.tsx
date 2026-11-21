import { useState } from 'react';
import { Image, View } from 'react-native';
import { useTheme } from '../theme';
import { Text } from './Text';

export type AvatarProps = {
  name: string;
  uri?: string | null;
  size?: number;
};

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

// Uses React Native's Image for now. When expo-image is added (media briefs) swap it in here and
// pass a stable cacheKey, as docs/build/01-architecture.md section 7 requires.
export function Avatar({ name, uri, size = 40 }: AvatarProps) {
  const { overlays } = useTheme();
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(uri) && !failed;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${name} avatar`}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: overlays.fill,
      }}
    >
      {showImage ? (
        <Image
          source={{ uri: uri as string }}
          style={{ width: size, height: size }}
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text variant="label" style={{ fontSize: size * 0.4, lineHeight: size * 0.5 }}>
          {initialsOf(name)}
        </Text>
      )}
    </View>
  );
}
